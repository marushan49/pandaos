import { Icon } from "../icons";
import { Modal } from "./modal";
import { ScrollView, FlatList } from "./scroll-view";
import { TextInput } from "./text-input";
import { copyText } from "./clipboard";
import { useToast } from "./toast";
import { useRevealedText } from "@/hooks/use-revealed-text";
import { MediaView } from "./media-view";
import { saveMedia } from "./save-media";
import { ImageDropZone } from "./image-drop-zone";

export const pluginReactNativeRuntime = {
  Icon,
  ImageDropZone,
  MediaView,
  saveMedia,
  Modal,
  ScrollView,
  FlatList,
  TextInput,
  copyText,
  useRevealedText,
  useToast,
};
