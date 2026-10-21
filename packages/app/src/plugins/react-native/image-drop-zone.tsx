import { useCallback, useMemo, useRef } from "react";
import { Pressable } from "react-native";
import type { ImageDropZoneProps } from "@getpaseo/plugin/client/react-native";
import type { AttachmentMetadata } from "@/attachments/types";
import {
  deleteAttachments,
  encodeAttachmentsForSend,
  persistAttachmentFromBlob,
  persistAttachmentFromDataUrl,
  persistAttachmentFromFileUri,
} from "@/attachments/service";
import { FileDropZone } from "@/components/file-drop/file-drop-zone";
import { useFileDrop } from "@/components/file-drop/use-file-drop";
import { pickAndPersistImages } from "@/composer/actions";
import { useImageAttachmentPicker } from "@/hooks/use-image-attachment-picker";

const persister = {
  persistFromBlob: persistAttachmentFromBlob,
  persistFromDataUrl: persistAttachmentFromDataUrl,
  persistFromFileUri: persistAttachmentFromFileUri,
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function DropSink({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles(images: AttachmentMetadata[]): void;
}) {
  useFileDrop({ onFiles }, { disabled });
  return null;
}

export function ImageDropZone({
  children,
  onImages,
  onError,
  disabled = false,
  accessibilityLabel,
  style,
}: ImageDropZoneProps) {
  const { pickImages } = useImageAttachmentPicker();
  const handlers = useRef({ onImages, onError });
  handlers.current = { onImages, onError };

  const deliver = useCallback(async (attachments: AttachmentMetadata[]) => {
    if (attachments.length === 0) return;
    try {
      const encoded = (await encodeAttachmentsForSend(attachments)) ?? [];
      if (encoded.length === 0) throw new Error("The image could not be read.");
      handlers.current.onImages(
        encoded.map((image) => ({ base64: image.data, mimeType: image.mimeType })),
      );
    } catch (error) {
      handlers.current.onError?.(describe(error));
    } finally {
      await deleteAttachments(attachments).catch(() => undefined);
    }
  }, []);

  const receive = useCallback(
    (attachments: AttachmentMetadata[]) => {
      void deliver(attachments);
    },
    [deliver],
  );

  const pick = useCallback(() => {
    void pickAndPersistImages({ pickImages, persister }).then(deliver, (error) =>
      handlers.current.onError?.(describe(error)),
    );
  }, [pickImages, deliver]);

  const state = useMemo(() => ({ disabled }), [disabled]);

  return (
    <FileDropZone disabled={disabled} style={style}>
      <DropSink disabled={disabled} onFiles={receive} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={state}
        disabled={disabled}
        onPress={pick}
      >
        {children}
      </Pressable>
    </FileDropZone>
  );
}
