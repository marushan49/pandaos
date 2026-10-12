import type {
  ComponentType,
  FunctionComponent,
  ReactNode,
  ForwardRefExoticComponent,
  RefAttributes,
  ReactElement,
  Ref,
} from "react";
import type {
  StyleProp,
  ViewStyle,
  ScrollView as NativeScrollView,
  ScrollViewProps,
  FlatList as NativeFlatList,
  FlatListProps,
  TextInput as NativeTextInput,
  TextInputProps,
} from "react-native";
import type { PluginIconProps } from "./contracts.js";

export interface ModalProps {
  title: string;
  icon?: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}

export interface ModalContentProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
}

export interface ModalComponent extends FunctionComponent<ModalProps> {
  Content: ComponentType<ModalContentProps>;
}

export type ToastVariant = "default" | "info" | "success" | "warning" | "error";

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ToastApi {
  show(message: string, options?: ToastOptions): void;
  error(message: string): void;
}

export declare const Icon: ComponentType<PluginIconProps>;
export interface MediaViewProps {
  base64: string;
  mimeType: string;
  accessibilityLabel: string;
  foreground: string;
  background: string;
  onError(message: string): void;
}
export declare const MediaView: ComponentType<MediaViewProps>;
export interface SaveMediaInput {
  base64: string;
  mimeType: string;
  fileName: string;
}
export declare function saveMedia(input: SaveMediaInput): Promise<"downloaded" | "dialog">;
export declare const Modal: ModalComponent;
export declare function useToast(): ToastApi;
export declare function useRevealedText(text: string, phase: "streaming" | "complete"): string;

export type { PluginIconProps } from "./contracts.js";

export declare const ScrollView: ForwardRefExoticComponent<
  ScrollViewProps & RefAttributes<NativeScrollView>
>;
export declare function FlatList<Item>(
  props: FlatListProps<Item> & { ref?: Ref<NativeFlatList<Item>> },
): ReactElement;
export declare function copyText(text: string): Promise<void>;

export declare const TextInput: ForwardRefExoticComponent<
  TextInputProps & RefAttributes<NativeTextInput>
>;
