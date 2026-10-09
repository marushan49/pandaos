import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  dismissRecovery,
  listRecovery,
  resumeRecovery,
  setAutomaticRecovery,
} from "./shared/contracts";
import { daemonEpoch, RecoveryService } from "./server/recovery";
import { RecoveryStore } from "./server/store";
import { queueEnvironment, readQueueEnvironment } from "./server/queue-environment";

const TOOLING_POLICY =
  "Host reliability: submit complete Android build/tooling commands through pandaos-android-queue -- COMMAND, including Expo/Node and native compilation. Reuse existing emulators: a standalone foreground emulator occupies the single queue slot until it exits. The host injects guarded JAVA_HOME and ANDROID_HOME; preserve them. Use pandaos-android-queue -- COMMAND for explicit tool paths or scripts that replace this environment. Do not bypass queue limits, start persistent Gradle/Kotlin daemons, or run heavy tooling inside the agent/daemon cgroup. A queued or resource-limited build may take longer or fail; report its job ID and failure rather than raising host limits. Session Recovery records interrupted turns and may continue them automatically when enabled; respect explicit stops, archived sessions and bounded retries. Read the saved task checkpoint and existing processes before continuing to avoid duplicate jobs.";

export default function contribute(server: PluginServerContext) {
  if (!server.dataDirectory)
    throw new Error("Aktualisiere den Host für dauerhafte Plugin-Speicherung.");
  const service = new RecoveryService(new RecoveryStore(server.dataDirectory), daemonEpoch());
  const removers = [
    server.before("agent.create", async ({ request }) => {
      if (!(await readQueueEnvironment())) return request;
      return {
        ...request,
        config: {
          ...request.config,
          systemPrompt: [request.config.systemPrompt, TOOLING_POLICY].filter(Boolean).join("\n\n"),
        },
      };
    }),
    server.before("agent.session_open", async ({ request }, { paseo }) => {
      const environment = await queueEnvironment(request);
      service.scheduleAutomatic(paseo);
      return environment;
    }),
    server.on("agent.turn_started", async (event, { paseo }) => {
      await service.started(event.agent, event.turnId);
      service.scheduleAutomatic(paseo);
    }),
    server.on("agent.turn_ended", async (event, { paseo }) => {
      await service.ended(event.agent, event.turnId, event.outcome);
      service.scheduleAutomatic(paseo);
    }),
    server.on("agent.closed", async (event, { paseo }) => {
      await service.closed(event.agent);
      service.scheduleAutomatic(paseo);
    }),
    server.on("agent.archived", async (event, { paseo }) => {
      await service.archived(event.agent.id);
      service.scheduleAutomatic(paseo);
    }),
  ];
  if (server.supportsLifecycleEvent?.("agent.user_message_accepted")) {
    removers.push(
      server.on("agent.user_message_accepted", async (event, { paseo }) => {
        await service.accepted(event.agent, event.messageId, event.origin);
        service.scheduleAutomatic(paseo);
      }),
    );
  }
  server.handle(setAutomaticRecovery, ({ enabled }, { paseo }) =>
    service.configureAutomatic(enabled, paseo),
  );
  server.handle(listRecovery, (_, { paseo }) => service.list(paseo));
  server.handle(resumeRecovery, ({ agentId, revision }, { paseo }) =>
    service.resume(agentId, revision, paseo),
  );
  server.handle(dismissRecovery, ({ agentId, revision }) => service.dismiss(agentId, revision));
  return async () => {
    for (const remove of removers) remove();
    await service.close();
  };
}
