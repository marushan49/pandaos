import type { Spec } from "@json-render/core";
import { formatValue, resolveValue, type Surface, type Values } from "../shared/surface";

export function createSpec(surface: Surface, values: Values | null): Spec {
  const children = [
    ...surface.inputs.map((_, index) => `input-${index}`),
    ...surface.blocks.flatMap((block, index) =>
      values || block.type === "Note" ? [`block-${index}`] : [],
    ),
  ];
  const elements: Spec["elements"] = { root: { type: "Stack", props: {}, children } };
  surface.inputs.forEach((_, index) => {
    elements[`input-${index}`] = { type: "Input", props: { index }, children: [] };
  });
  surface.blocks.forEach((block, index) => {
    if (!values && block.type !== "Note") return;
    const resolved = values ?? {};
    let props: Record<string, unknown>;
    switch (block.type) {
      case "Note":
        props = { text: block.text };
        break;
      case "Metric":
        props = {
          label: block.label,
          text: formatValue(resolveValue(block.value, resolved), block.format),
        };
        break;
      case "Table":
        props = {
          label: block.label,
          columns: block.columns.map((text, column) => ({ id: `column-${column}`, text })),
          rows: block.rows.map((row, rowIndex) => ({
            id: `row-${rowIndex}`,
            cells: row.map((cell, column) => ({
              id: `column-${column}`,
              text: typeof cell === "string" ? cell : formatValue(resolveValue(cell, resolved)),
            })),
          })),
        };
        break;
      case "BarChart": {
        const maximum = Math.max(
          1,
          ...block.points.map((point) => Math.abs(resolveValue(point.value, resolved))),
        );
        props = {
          label: block.label,
          points: block.points.map((point, pointIndex) => ({
            id: `point-${pointIndex}`,
            label: point.label,
            text: formatValue(resolveValue(point.value, resolved), block.format),
            width: (Math.abs(resolveValue(point.value, resolved)) / maximum) * 100,
          })),
        };
        break;
      }
    }
    elements[`block-${index}`] = { type: block.type, props, children: [] };
  });
  return { root: "root", elements };
}
