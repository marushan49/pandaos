import { createContext, type ReactNode, useContext, useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export type MarkdownTextSurface = "prose" | "table-cell";

const MarkdownTextSurfaceContext = createContext<MarkdownTextSurface>("prose");
export const MarkdownTableColumnsContext = createContext(1);

export function MarkdownTableCellText({
  children,
  style,
  dataSet,
}: {
  children: ReactNode;
  style: StyleProp<ViewStyle>;
  dataSet?: Record<string, string>;
}) {
  const columns = useContext(MarkdownTableColumnsContext);
  const cellStyle = useMemo(
    () => [style, { width: `${100 / columns}%` as const, flex: -1, minWidth: 0 }],
    [style, columns],
  );
  return (
    <MarkdownTextSurfaceContext value="table-cell">
      <View style={cellStyle} dataSet={dataSet}>
        {children}
      </View>
    </MarkdownTextSurfaceContext>
  );
}

export function useMarkdownTextSurface(): MarkdownTextSurface {
  return useContext(MarkdownTextSurfaceContext);
}

export function iosMarkdownTextIsSelectable(surface: MarkdownTextSurface): boolean {
  return surface !== "table-cell";
}
