import type { ReadingPreset } from "@/hooks/use-settings/storage";
import type { Theme } from "./theme";

export interface ReadingProse {
  fontSize: number;
  lineHeight: number;
  paragraphGap: number;
  serif: boolean;
}

const CALM_SIZE_STEP = 1;
const READING_SIZE_STEP = 5;
const COMPACT_LINE_HEIGHT = 1.4;
const CALM_LINE_HEIGHT = 1.6;
const READING_LINE_HEIGHT = 1.5;

export function resolveReadingProse(
  preset: ReadingPreset,
  theme: Pick<Theme, "fontSize" | "spacing">,
): ReadingProse {
  const content = theme.fontSize.content;
  switch (preset) {
    case "calm": {
      const fontSize = content + CALM_SIZE_STEP;
      return {
        fontSize,
        lineHeight: Math.round(fontSize * CALM_LINE_HEIGHT),
        paragraphGap: theme.spacing[4],
        serif: false,
      };
    }
    case "reading": {
      const fontSize = content + READING_SIZE_STEP;
      return {
        fontSize,
        lineHeight: Math.round(fontSize * READING_LINE_HEIGHT),
        paragraphGap: theme.spacing[6],
        serif: true,
      };
    }
    default:
      return {
        fontSize: content,
        lineHeight: Math.round(content * COMPACT_LINE_HEIGHT),
        paragraphGap: theme.spacing[3],
        serif: false,
      };
  }
}
