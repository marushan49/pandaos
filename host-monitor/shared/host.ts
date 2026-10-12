import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const hostVerdictSchema = z.enum(["fits", "tight", "avoid"]);

export const hostTriageSchema = z.object({
  state: z.enum(["none", "asking", "judging", "done", "failed"]),
  verdict: z.enum(["needed", "not_needed", "unclear"]).nullable(),
  reason: z.string().nullable(),
  at: z.string().nullable(),
});

export const hostAgentSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  status: z.string(),
  folder: z.string().nullable(),
  unit: z.string().nullable(),
  processes: z.number(),
  gb: z.number(),
  triage: hostTriageSchema,
});

export const hostSnapshotSchema = z.object({
  takenAt: z.string(),
  memory: z.object({
    totalGb: z.number(),
    availableGb: z.number(),
    usedGb: z.number(),
    swapTotalGb: z.number(),
    swapUsedGb: z.number(),
  }),
  load: z.object({
    one: z.number(),
    five: z.number(),
    fifteen: z.number(),
    cpus: z.number(),
  }),
  narrative: z.array(z.string()),
  owners: z.array(
    z.object({
      owner: z.string(),
      gb: z.number(),
      processes: z.number(),
    }),
  ),
  consumers: z.array(
    z.object({
      pid: z.number(),
      kind: z.string(),
      label: z.string(),
      owner: z.string(),
      gb: z.number(),
      freeOnStopGb: z.number(),
      unit: z.string().nullable(),
      folder: z.string().nullable(),
      ports: z.array(z.object({ port: z.number(), connections: z.number() })),
      ageMinutes: z.number(),
      stoppable: z.boolean(),
      home: z.string().nullable(),
    }),
  ),
  tabs: z.array(
    z.object({
      browserId: z.string(),
      workspaceId: z.string(),
      workspace: z.string().nullable(),
      url: z.string(),
      title: z.string(),
      loaded: z.boolean().nullable(),
      ageMinutes: z.number().nullable(),
    }),
  ),
  tabsClosable: z.boolean(),
  profiles: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      expectedGb: z.number(),
      peakGb: z.number(),
      freeAfterGb: z.number(),
      freeAtPeakGb: z.number(),
      verdict: hostVerdictSchema,
    }),
  ),
  agents: z.array(hostAgentSchema),
  history: z.array(z.object({ at: z.string(), availableGb: z.number() })),
});

export type HostSnapshot = z.infer<typeof hostSnapshotSchema>;
export type HostConsumer = HostSnapshot["consumers"][number];
export type HostVerdict = z.infer<typeof hostVerdictSchema>;
export type HostAgent = z.infer<typeof hostAgentSchema>;
export type HostTriage = z.infer<typeof hostTriageSchema>;
export type HostTab = HostSnapshot["tabs"][number];

export const hostStop = defineRpc({
  name: "host.stop",
  input: z.object({ pid: z.number() }),
  output: z.object({ stopped: z.boolean(), message: z.string() }),
});

export const hostCloseTab = defineRpc({
  name: "host.tab.close",
  input: z.object({ workspaceId: z.string(), browserId: z.string() }),
  output: z.object({ closed: z.boolean(), message: z.string() }),
});

export const hostSnapshot = defineRpc({
  name: "host.snapshot",
  input: z.object({}),
  output: hostSnapshotSchema,
});

export const hostTriage = defineRpc({
  name: "host.triage",
  input: z.object({ agentId: z.string() }),
  output: z.object({ started: z.boolean(), message: z.string() }),
});
