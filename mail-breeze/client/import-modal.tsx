import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MailSchema } from "../shared/contracts";
import type { Breeze } from "./api";
import { Body, Button, Field, Row, Stack, useKit } from "./kit";
import { space } from "./theme";

interface Draft {
  subject: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  webLink: string;
  body: string;
}

const blank = (): Draft => ({
  subject: "",
  sender: "",
  senderEmail: "",
  receivedAt: new Date().toISOString(),
  webLink: "",
  body: "",
});

function newId() {
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const FIELD_LABELS: Record<string, string> = {
  subject: "Betreff",
  senderEmail: "Absender-Adresse",
  body: "Inhalt",
  receivedAt: "Empfangen am",
  webLink: "Link",
  sender: "Absender",
};

const SPECIAL_MESSAGES: Record<string, string> = {
  receivedAt: "Bitte ein Datum wie 2026-10-19T09:30:00Z angeben.",
  webLink: "Bitte eine vollständige Adresse mit https:// angeben.",
};

function issueMessage(key: string): string {
  return SPECIAL_MESSAGES[key] ?? `${FIELD_LABELS[key] ?? key}: Eingabe fehlt oder ist ungültig.`;
}

const NO_ERRORS: Record<string, string> = {};

export function ImportModal({
  open,
  onClose,
  breeze,
}: {
  open: boolean;
  onClose(): void;
  breeze: Breeze;
}) {
  const { theme } = useKit();
  const [draft, setDraft] = useState<Draft>(blank);
  const [errors, setErrors] = useState<Record<string, string>>(NO_ERRORS);
  const { importMail } = breeze;

  useEffect(() => {
    if (open) {
      setDraft(blank());
      setErrors(NO_ERRORS);
    }
  }, [open]);

  const setSubject = useCallback(
    (value: string) => setDraft((d) => ({ ...d, subject: value })),
    [],
  );
  const setSender = useCallback((value: string) => setDraft((d) => ({ ...d, sender: value })), []);
  const setSenderEmail = useCallback(
    (value: string) => setDraft((d) => ({ ...d, senderEmail: value })),
    [],
  );
  const setReceivedAt = useCallback(
    (value: string) => setDraft((d) => ({ ...d, receivedAt: value })),
    [],
  );
  const setBody = useCallback((value: string) => setDraft((d) => ({ ...d, body: value })), []);
  const setWebLink = useCallback(
    (value: string) => setDraft((d) => ({ ...d, webLink: value })),
    [],
  );
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose],
  );
  const icon = useMemo(
    () => <Icon name="ClipboardPaste" size={18} color={theme.colors.foreground} />,
    [theme],
  );

  const submit = useCallback(() => {
    const id = newId();
    const link = draft.webLink.trim();
    const parsed = MailSchema.safeParse({
      id,
      conversationId: id,
      subject: draft.subject,
      sender: draft.sender.trim(),
      senderEmail: draft.senderEmail.trim(),
      body: draft.body,
      receivedAt: draft.receivedAt.trim(),
      webLink: link === "" ? undefined : link,
    });
    if (parsed.success) {
      setErrors(NO_ERRORS);
      importMail(parsed.data, onClose);
      return;
    }
    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      next[key] ??= issueMessage(key);
    }
    setErrors(next);
  }, [draft, importMail, onClose]);

  return (
    <Modal title="Mail manuell importieren" icon={icon} open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        <Body muted>
          Die Mail wird wie ein Posteingang-Eintrag zur Aufgabe. Sie wird nirgends beantwortet oder
          weitergeleitet.
        </Body>
        <Stack gap={space.md}>
          <Field
            label="Betreff"
            value={draft.subject}
            onChangeText={setSubject}
            error={errors.subject}
            placeholder="Angebot für Q4 prüfen"
          />
          <Field
            label="Absender-Name"
            value={draft.sender}
            onChangeText={setSender}
            error={errors.sender}
            placeholder="Mara Beispiel"
          />
          <Field
            label="Absender-Adresse"
            value={draft.senderEmail}
            onChangeText={setSenderEmail}
            error={errors.senderEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="mara@example.com"
          />
          <Field
            label="Empfangen am"
            value={draft.receivedAt}
            onChangeText={setReceivedAt}
            error={errors.receivedAt}
            autoCapitalize="none"
            hint="Voreingestellt ist jetzt. Format: 2026-10-19T09:30:00Z"
          />
          <Field
            label="Inhalt"
            value={draft.body}
            onChangeText={setBody}
            error={errors.body}
            multiline
            numberOfLines={8}
            minHeight={160}
            placeholder="Text der Mail"
          />
          <Field
            label="Link zur Mail (optional)"
            value={draft.webLink}
            onChangeText={setWebLink}
            error={errors.webLink}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://..."
          />
        </Stack>
        <Row wrap gap={space.md}>
          <Button
            label="Als Aufgabe importieren"
            icon="Inbox"
            variant="primary"
            busy={breeze.busy === "import"}
            onPress={submit}
          />
          <Button label="Abbrechen" variant="ghost" onPress={onClose} />
        </Row>
      </Modal.Content>
    </Modal>
  );
}
