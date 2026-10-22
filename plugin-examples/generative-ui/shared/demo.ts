import { surfaceSchema } from "./surface";

export const costSimulator = surfaceSchema.parse({
  protocol: "pandaos.ui",
  version: 1,
  id: "cost-simulator",
  revision: 1,
  title: "Monthly cost simulator",
  fallback:
    "Illustrative cost simulator, not provider pricing. 10,000 requests × 2,000 tokens × $3 per million tokens + $20 fixed cost = $80/month. Compare with $50/month fixed hosting. Change the assumptions locally; nothing is sent to an agent.",
  inputs: [
    {
      id: "requests",
      label: "Requests per month",
      kind: "slider",
      min: 0,
      max: 100000,
      step: 1000,
      value: 10000,
    },
    {
      id: "tokens",
      label: "Tokens per request",
      kind: "number",
      min: 0,
      max: 100000,
      step: 100,
      value: 2000,
    },
    {
      id: "price",
      label: "USD per million tokens",
      kind: "number",
      min: 0,
      max: 1000,
      step: 0.1,
      value: 3,
    },
    {
      id: "fixed",
      label: "Fixed monthly cost (USD)",
      kind: "number",
      min: 0,
      max: 100000,
      step: 1,
      value: 20,
    },
  ],
  calculations: [
    { id: "token-count", operation: "product", values: [{ ref: "requests" }, { ref: "tokens" }] },
    { id: "millions", operation: "ratio", values: [{ ref: "token-count" }, 1000000] },
    { id: "usage", operation: "product", values: [{ ref: "millions" }, { ref: "price" }] },
    { id: "total", operation: "sum", values: [{ ref: "usage" }, { ref: "fixed" }] },
  ],
  blocks: [
    { type: "Note", text: "Illustrative assumptions. These are not current provider prices." },
    { type: "Metric", label: "Estimated monthly cost", value: { ref: "total" }, format: "USD" },
    {
      type: "BarChart",
      label: "Monthly comparison (USD)",
      format: "USD",
      points: [
        { label: "Usage + fixed", value: { ref: "total" } },
        { label: "Fixed hosting example", value: 50 },
      ],
    },
    {
      type: "Table",
      label: "Cost breakdown (USD)",
      columns: ["Item", "Monthly USD"],
      rows: [
        ["Usage", { ref: "usage" }],
        ["Fixed", { ref: "fixed" }],
        ["Total", { ref: "total" }],
      ],
    },
  ],
  actions: ["reset", "save"],
});
