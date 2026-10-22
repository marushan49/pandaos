import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useHostFeature } from "@/runtime/host-features";
import { openExternalUrl } from "@/utils/open-external-url";
import { settingsStyles } from "@/styles/settings";
import { useProviderAccountForm } from "./use-provider-account-form";

function AccountSheet({
  serverId,
  provider,
  initialName,
  initialDescription,
  initialSharedTeam = false,
  onClose,
}: {
  serverId: string;
  provider?: string;
  initialName: string;
  initialDescription: string;
  initialSharedTeam?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { model, state: form } = useProviderAccountForm(
    serverId,
    { provider, name: initialName, description: initialDescription, sharedTeam: initialSharedTeam },
    onClose,
  );
  const {
    name,
    description,
    sharedTeam,
    code,
    loginState: state,
    error,
    busy,
    connected,
    waiting,
  } = form;
  const header = useMemo<SheetHeader>(
    () => ({ title: t(provider ? "providerAccounts.edit" : "providerAccounts.add") }),
    [provider, t],
  );

  const openSignIn = useCallback(() => {
    if (state?.status !== "waiting") return;
    void openExternalUrl(state.url).catch((err: unknown) => model.setError(err));
  }, [model, state]);

  return (
    <AdaptiveModalSheet
      visible
      header={header}
      onClose={onClose}
      desktopMaxWidth={480}
      testID="provider-account-sheet"
    >
      <View style={styles.body}>
        {!waiting ? (
          <>
            <Field label={t("providerAccounts.name")}>
              <FormTextInput
                initialValue={name}
                onChangeText={model.setName}
                accessibilityLabel={t("providerAccounts.name")}
                maxLength={100}
                editable={!busy}
              />
            </Field>
            <Field label={t("providerAccounts.note")} hint={t("providerAccounts.noteHint")}>
              <FormTextInput
                initialValue={description}
                onChangeText={model.setDescription}
                accessibilityLabel={t("providerAccounts.note")}
                placeholder={t("providerAccounts.notePlaceholder")}
                multiline
                maxLength={1000}
                editable={!busy}
              />
            </Field>
            <View style={styles.details}>
              <View style={styles.note}>
                <Text style={styles.text}>{t("providerAccounts.sharedTeam")}</Text>
                {sharedTeam ? (
                  <Text style={settingsStyles.rowHint}>{t("providerAccounts.memoryPolicy")}</Text>
                ) : null}
              </View>
              <Switch
                value={sharedTeam}
                onValueChange={model.setSharedTeam}
                disabled={busy}
                accessibilityLabel={t("providerAccounts.sharedTeam")}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.progress}>
              <LoadingSpinner size="small" color={styles.text.color} />
              <Text style={styles.text}>{t("providerAccounts.waiting")}</Text>
            </View>
            {state?.status === "waiting" ? (
              <>
                <Button onPress={openSignIn}>{t("providerAccounts.open")}</Button>
                <Field label={t("providerAccounts.code")} hint={t("providerAccounts.codeHint")}>
                  <FormTextInput
                    initialValue=""
                    resetKey={busy ? "submitting" : "ready"}
                    onChangeText={model.setCode}
                    accessibilityLabel={t("providerAccounts.code")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    maxLength={4096}
                    editable={!busy}
                    onSubmitEditing={model.submitCode}
                  />
                </Field>
              </>
            ) : null}
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button variant="secondary" onPress={onClose}>
            {t("common.actions.cancel")}
          </Button>
          {state?.status === "waiting" ? (
            <Button onPress={model.submitCode} disabled={busy || !code.trim()}>
              {t("providerAccounts.confirm")}
            </Button>
          ) : null}
          {!waiting ? (
            <Button onPress={model.save} disabled={busy || !connected || !name.trim()}>
              {busy
                ? t("providerAccounts.saving")
                : t(provider ? "common.actions.save" : "providerAccounts.signIn")}
            </Button>
          ) : null}
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

export function AddClaudeAccount({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(() => ({ title: t("providerAccounts.add") }), [t]);
  const supported = useHostFeature(serverId, "claudeAccountLogin");
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button variant="secondary" size="sm" onPress={show}>
        {t("providerAccounts.add")}
      </Button>
      {open && supported ? (
        <AccountSheet
          serverId={serverId}
          initialName="Claude"
          initialDescription=""
          onClose={close}
        />
      ) : null}
      {open && !supported ? (
        <AdaptiveModalSheet visible header={header} onClose={close}>
          <View style={styles.body}>
            <Text style={styles.text}>{t("providerAccounts.updateHost")}</Text>
            <Button onPress={close}>{t("common.actions.close")}</Button>
          </View>
        </AdaptiveModalSheet>
      ) : null}
    </>
  );
}

export function ProviderAccountDetails({
  serverId,
  provider,
}: {
  serverId: string;
  provider: string;
}) {
  const { t } = useTranslation();
  const { entries } = useProvidersSnapshot(serverId);
  const { config } = useDaemonConfig(serverId);
  const entry = entries?.find((item) => item.provider === provider);
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  if (provider !== "claude" && config?.providers[provider]?.extends !== "claude") return null;
  return (
    <View style={styles.body}>
      <View style={styles.details}>
        <Text style={[settingsStyles.rowHint, styles.note]}>
          {entry?.description || t("providerAccounts.noNote")}
        </Text>
        <Button variant="ghost" size="sm" onPress={show}>
          {t("providerAccounts.edit")}
        </Button>
      </View>
      {config?.providers[provider]?.accountPolicy === "shared-team-9elf26-memory" ? (
        <Text style={settingsStyles.rowHint}>
          {t("providerAccounts.sharedTeam")} {t("providerAccounts.memoryPolicy")}
        </Text>
      ) : null}
      {open ? (
        <AccountSheet
          serverId={serverId}
          provider={provider}
          initialName={entry?.label ?? provider}
          initialDescription={entry?.description ?? ""}
          initialSharedTeam={
            config?.providers[provider]?.accountPolicy === "shared-team-9elf26-memory"
          }
          onClose={close}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.spacing[4], padding: theme.spacing[4] },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  progress: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.base, flexShrink: 1 },
  error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
  details: { flexDirection: "row", gap: theme.spacing[3], alignItems: "flex-start" },
  note: { flex: 1 },
}));
