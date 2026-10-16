import { useTranslation } from "react-i18next";
import { PDF_MIME_TYPE } from "./preview-lifecycle/model";

const embedStyle = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  border: "none",
} as const;

export function FilePdfPreview({ uri, testID }: { uri: string; testID?: string }) {
  const { t } = useTranslation();
  return (
    <embed
      data-testid={testID}
      title={t("panels.file.editor.preview")}
      src={uri}
      type={PDF_MIME_TYPE}
      style={embedStyle}
    />
  );
}
