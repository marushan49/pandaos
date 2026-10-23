import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  dismissRecovery,
  listRecovery,
  prepareRestart,
  resumeRecovery,
  restartStatus,
  resumeRestart,
  setAutomaticRecovery,
} from "./shared/contracts";
import { daemonEpoch, RecoveryService } from "./server/recovery";
import { RecoveryStore } from "./server/store";
import { queueEnvironment, readQueueEnvironment } from "./server/queue-environment";

const TOOLING_POLICY =
  "Host reliability: submit complete build, test and tooling commands that need more than a few seconds of CPU or about 1 GiB of memory (Android/Gradle, Expo, Flutter, Cargo, large Node builds and test runs) through pandaos-android-queue -- COMMAND (alias of pandaos-build-scheduler), including Expo/Node and native compilation. The host scheduler runs several jobs in parallel based on measured CPU, memory and pressure; never start a second scheduler or your own parallel queue. Mark device installs and blocking checks with --priority interactive or blocking, maintenance with --priority background. Reuse existing emulators: a foreground emulator stays a running job until it exits. Do not run long-lived servers through the queue unless a test needs them. The host injects guarded JAVA_HOME and ANDROID_HOME; preserve them. Use pandaos-android-queue -- COMMAND for explicit tool paths or scripts that replace this environment. Do not bypass queue limits, start persistent Gradle/Kotlin daemons, or run heavy tooling inside the agent/daemon cgroup. A queued or resource-limited build may take longer or fail; report its job ID and failure rather than raising host limits. Session Recovery records interrupted turns and may continue them automatically when enabled; respect explicit stops, archived sessions and bounded retries. Read the saved task checkpoint and existing processes before continuing to avoid duplicate jobs.";

const RESTART_POLICY =
  'PandaOS daemon restarts: never run systemctl restart on the PandaOS daemon or wait for idle to restart it. With the user\'s permission use pandaos-planned-restart (see the pandaos-daemon-restart skill). When you receive the message "Geplanter Neustart des PandaOS-Daemons", finish only your current step, start nothing new, reply with STATUS: working | watching | done and CHECKPOINT: (include background jobs, queue job IDs, heartbeats and browser tabs), then end your turn. After the restart your checkpoint comes back; continue from there.';

export default function contribute(server: PluginServerContext) {
  if (!server.dataDirectory)
    throw new Error("Aktualisiere den Host für dauerhafte Plugin-Speicherung.");
  const service = new RecoveryService(new RecoveryStore(server.dataDirectory), daemonEpoch());
  const removers = [
    server.before("agent.create", async ({ request }) => {
      const policies = [RESTART_POLICY];
      if (await readQueueEnvironment()) policies.unshift(TOOLING_POLICY);
      return {
        ...request,
        config: {
          ...request.config,
          systemPrompt: [request.config.systemPrompt, ...policies].filter(Boolean).join("\n\n"),
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
  server.handle(prepareRestart, (input, { paseo }) => service.prepareRestart(input, paseo));
  server.handle(restartStatus, ({ runId, phase }) => service.restartStatus(runId, phase));
  server.handle(resumeRestart, ({ runId }, { paseo }) => service.resumeRestart(runId, paseo));
  server.handle(dismissRecovery, ({ agentId, revision }) => service.dismiss(agentId, revision));
  return async () => {
    for (const remove of removers) remove();
    await service.close();
  };
}
