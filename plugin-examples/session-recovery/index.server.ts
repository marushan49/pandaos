import type { PluginServerContext } from "@getpaseo/plugin/server";
import { dismissRecovery, listRecovery, resumeRecovery } from "./shared/contracts";
import { daemonEpoch, RecoveryService } from "./server/recovery";
import { RecoveryStore } from "./server/store";
import { queueEnvironment, readQueueEnvironment } from "./server/queue-environment";

const TOOLING_POLICY =
  "Host reliability: submit complete Android build/tooling commands through pandaos-android-queue -- COMMAND, including Expo/Node and native compilation. Reuse existing emulators: a standalone foreground emulator occupies the single queue slot until it exits. The host injects guarded JAVA_HOME and ANDROID_HOME; preserve them. Use pandaos-android-queue -- COMMAND for explicit tool paths or scripts that replace this environment. Do not bypass queue limits, start persistent Gradle/Kotlin daemons, or run heavy tooling inside the agent/daemon cgroup. A queued or resource-limited build may take longer or fail; report its job ID and failure rather than raising host limits. Session Recovery tracks interrupted turns; continuation is selected by the user. Read the saved task checkpoint and existing processes before continuing to avoid duplicate jobs.";

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
    server.before("agent.session_open", ({ request }) => queueEnvironment(request)),
    server.on("agent.turn_started", (event) => service.started(event.agent, event.turnId)),
    server.on("agent.turn_ended", (event) =>
      service.ended(event.agent, event.turnId, event.outcome),
    ),
    server.on("agent.closed", (event) => service.closed(event.agent)),
    server.on("agent.archived", (event) => service.archived(event.agent.id)),
  ];
  if (server.supportsLifecycleEvent?.("agent.user_message_accepted")) {
    removers.push(
      server.on("agent.user_message_accepted", (event) =>
        service.accepted(event.agent, event.messageId),
      ),
    );
  }
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
