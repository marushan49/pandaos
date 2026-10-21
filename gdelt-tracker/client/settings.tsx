import { useRpc } from "@getpaseo/plugin/client";
import {
  Icon,
  ImageDropZone,
  TextInput,
  type DroppedImage,
} from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  readScreenshot,
  removeEntry,
  saveConfig,
  saveEntries,
  saveEntry,
  testTelegram,
} from "../shared/contracts.ts";
import {
  entryDraft,
  instrumentLabels,
  kindLabels,
  type Entry,
  type EntryDraft,
  type ImportedPosition,
  type Watchlist,
} from "../shared/model.ts";
import { Button, Choice } from "./controls.tsx";
import type { Styles } from "./styles.ts";

const kinds = Object.entries(kindLabels).map(([value, label]) => ({
  value: value as Entry["kind"],
  label,
}));
const instruments = Object.entries(instrumentLabels).map(([value, label]) => ({
  value: value as Entry["instrument"],
  label,
}));

function splitKeywords(value: string) {
  return value
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

function useInvalidate() {
  const cache = useQueryClient();
  return useCallback(() => cache.invalidateQueries({ queryKey: ["aktien-state"] }), [cache]);
}

function Field({
  label,
  styles,
  value,
  placeholder,
  onChange,
  secure,
}: {
  label: string;
  styles: Styles;
  value?: string;
  placeholder?: string;
  onChange(value: string): void;
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.strong}>{label}</Text>
      <TextInput
        style={styles.input}
        defaultValue={value}
        placeholder={placeholder}
        placeholderTextColor={styles.theme.colors.foregroundMuted}
        accessibilityLabel={label}
        secureTextEntry={secure}
        autoCapitalize="none"
        onChangeText={onChange}
      />
    </View>
  );
}

function EntryForm({
  draft,
  watchlist,
  styles,
  onDone,
}: {
  draft: EntryDraft & { id?: string };
  watchlist: Watchlist;
  styles: Styles;
  onDone(): void;
}) {
  const save = useRpc(saveEntry);
  const invalidate = useInvalidate();
  const [value, setValue] = useState(draft);
  const [keywords, setKeywords] = useState((draft.keywords ?? []).join(", "));
  const [leverage, setLeverage] = useState(String(draft.leverage ?? 1));
  const mutation = useMutation({
    mutationFn: () => {
      const parsed = entryDraft.safeParse({
        ...value,
        keywords: splitKeywords(keywords),
        leverage: Number(leverage.replace(",", ".")),
      });
      if (!parsed.success)
        throw new Error(
          "Name, mindestens ein Suchbegriff (2+ Zeichen) und ein Hebel als Zahl nötig.",
        );
      return save({ revision: watchlist.revision, id: value.id, entry: parsed.data });
    },
    onSuccess: () => {
      void invalidate();
      onDone();
    },
  });
  const { mutate } = mutation;
  const submit = useCallback(() => mutate(), [mutate]);
  const setName = useCallback((name: string) => setValue((v) => ({ ...v, name })), []);
  const setTicker = useCallback((ticker: string) => setValue((v) => ({ ...v, ticker })), []);
  const setKind = useCallback((kind: Entry["kind"]) => setValue((v) => ({ ...v, kind })), []);
  const setInstrument = useCallback(
    (instrument: Entry["instrument"]) => setValue((v) => ({ ...v, instrument })),
    [],
  );
  return (
    <View style={styles.section}>
      <Field label="Name" styles={styles} value={draft.name} onChange={setName} />
      <View style={styles.wrap}>
        {kinds.map((option) => (
          <Choice<Entry["kind"]>
            key={option.value}
            theme={styles.theme}
            option={option}
            selected={value.kind === option.value}
            onSelect={setKind}
          />
        ))}
      </View>
      <View style={styles.wrap}>
        {instruments.map((option) => (
          <Choice<Entry["instrument"]>
            key={option.value}
            theme={styles.theme}
            option={option}
            selected={(value.instrument ?? "stock") === option.value}
            onSelect={setInstrument}
          />
        ))}
      </View>
      <Field
        label="Suchbegriffe (Englisch, durch Komma getrennt)"
        styles={styles}
        value={keywords}
        placeholder="Nvidia, NVDA"
        onChange={setKeywords}
      />
      <View style={styles.row}>
        <View style={styles.grow}>
          <Field
            label="Ticker (US, für Kurse)"
            styles={styles}
            value={draft.ticker}
            placeholder="NVDA"
            onChange={setTicker}
          />
        </View>
        <View style={styles.narrow}>
          <Field
            label="Hebel"
            styles={styles}
            value={leverage}
            placeholder="1"
            onChange={setLeverage}
          />
        </View>
      </View>
      {mutation.error ? (
        <Text accessibilityRole="alert" style={styles.danger}>
          {mutation.error.message}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button theme={styles.theme} label="Abbrechen" text="Abbrechen" onPress={onDone} />
        <Button
          theme={styles.theme}
          label="Speichern"
          text={mutation.isPending ? "Speichert…" : "Speichern"}
          primary
          disabled={mutation.isPending}
          onPress={submit}
        />
      </View>
    </View>
  );
}

function EntryRow({
  entry,
  styles,
  onEdit,
  onRemove,
}: {
  entry: Entry;
  styles: Styles;
  onEdit(entry: Entry): void;
  onRemove(entry: Entry): void;
}) {
  const edit = useCallback(() => onEdit(entry), [onEdit, entry]);
  const remove = useCallback(() => onRemove(entry), [onRemove, entry]);
  return (
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text style={styles.strong} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {[
            kindLabels[entry.kind],
            instrumentLabels[entry.instrument],
            entry.leverage !== 1 ? `Hebel ${entry.leverage}` : "",
            entry.keywords.join(", "),
          ]
            .filter(Boolean)
            .join("  ")}
        </Text>
      </View>
      <Button
        theme={styles.theme}
        label={`${entry.name} bearbeiten`}
        icon="Pencil"
        onPress={edit}
      />
      <Button
        theme={styles.theme}
        label={`${entry.name} entfernen`}
        icon="Trash2"
        onPress={remove}
      />
    </View>
  );
}

function PreviewRow({
  position,
  index,
  styles,
  onChange,
}: {
  position: ImportedPosition & { keep: boolean };
  index: number;
  styles: Styles;
  onChange(index: number, patch: Partial<ImportedPosition & { keep: boolean }>): void;
}) {
  const toggle = useCallback(
    () => onChange(index, { keep: !position.keep }),
    [onChange, index, position.keep],
  );
  const setKeywords = useCallback(
    (value: string) => onChange(index, { keywords: splitKeywords(value) }),
    [onChange, index],
  );
  const box = useMemo(
    () => [styles.section, { opacity: position.keep ? 1 : 0.5 }],
    [styles.section, position.keep],
  );
  return (
    <View style={box}>
      <View style={styles.row}>
        <Button
          theme={styles.theme}
          label={`${position.name} ${position.keep ? "abwählen" : "auswählen"}`}
          icon={position.keep ? "SquareCheck" : "Square"}
          onPress={toggle}
        />
        <View style={styles.grow}>
          <Text style={styles.strong} numberOfLines={1}>
            {position.name}
          </Text>
          <Text style={styles.muted}>
            {[
              instrumentLabels[position.instrument],
              position.ticker,
              position.leverage !== 1 ? `Hebel ${position.leverage}` : "",
            ]
              .filter(Boolean)
              .join("  ")}
          </Text>
        </View>
      </View>
      <TextInput
        style={styles.input}
        defaultValue={position.keywords.join(", ")}
        placeholderTextColor={styles.theme.colors.foregroundMuted}
        accessibilityLabel={`Suchbegriffe für ${position.name}`}
        onChangeText={setKeywords}
      />
    </View>
  );
}

function Import({ watchlist, styles }: { watchlist: Watchlist; styles: Styles }) {
  const read = useRpc(readScreenshot);
  const saveMany = useRpc(saveEntries);
  const invalidate = useInvalidate();
  const [preview, setPreview] = useState<(ImportedPosition & { keep: boolean })[]>([]);
  const [dropError, setDropError] = useState("");
  const reading = useMutation({
    mutationFn: (images: DroppedImage[]) => read({ images }),
    onSuccess: ({ positions }) =>
      setPreview(positions.map((position) => ({ ...position, keep: true }))),
  });
  const saving = useMutation({
    mutationFn: () =>
      saveMany({
        revision: watchlist.revision,
        entries: preview
          .filter((item) => item.keep && item.keywords.length > 0)
          .map(({ name, instrument, ticker, leverage, keywords }) => ({
            name,
            kind: "holding" as const,
            instrument,
            ticker: instrument === "stock" ? ticker.replace(/[^A-Za-z0-9.-]/g, "") : "",
            leverage,
            keywords,
          })),
      }),
    onSuccess: () => {
      setPreview([]);
      void invalidate();
    },
  });
  const onImages = useCallback(
    (images: DroppedImage[]) => {
      setDropError("");
      reading.mutate(images);
    },
    [reading],
  );
  const change = useCallback(
    (index: number, patch: Partial<ImportedPosition & { keep: boolean }>) =>
      setPreview((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    [],
  );
  const confirm = useCallback(() => saving.mutate(), [saving]);
  const discard = useCallback(() => setPreview([]), []);
  const count = preview.filter((item) => item.keep).length;
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Depot-Screenshot</Text>
      {ImageDropZone ? (
        <ImageDropZone
          accessibilityLabel="Depot-Screenshot auswählen oder hierher ziehen"
          onImages={onImages}
          onError={setDropError}
          disabled={reading.isPending}
        >
          <View style={styles.drop}>
            <Icon name="ImagePlus" size={22} color={styles.theme.colors.foreground} />
            <Text style={styles.strong}>
              {reading.isPending
                ? "Screenshot wird gelesen…"
                : "Screenshot hierher ziehen oder tippen"}
            </Text>
            <Text style={styles.muted}>
              Trade Republic oder andere Depot-Apps. Es werden nur Namen übernommen.
            </Text>
          </View>
        </ImageDropZone>
      ) : (
        <Text style={styles.muted}>
          Bitte PandaOS aktualisieren, um Screenshots zu importieren.
        </Text>
      )}
      {dropError || reading.error ? (
        <Text accessibilityRole="alert" style={styles.danger}>
          {dropError || reading.error?.message}
        </Text>
      ) : null}
      {preview.length > 0 ? (
        <>
          <Text style={styles.muted}>
            Vorschau: Suchbegriffe prüfen, unpassende Positionen abwählen.
          </Text>
          {preview.map((position, index) => (
            <PreviewRow
              key={`${position.name}-${position.ticker}-${position.instrument}`}
              position={position}
              index={index}
              styles={styles}
              onChange={change}
            />
          ))}
          {saving.error ? (
            <Text accessibilityRole="alert" style={styles.danger}>
              {saving.error.message}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Button
              theme={styles.theme}
              label="Vorschau verwerfen"
              text="Verwerfen"
              onPress={discard}
            />
            <Button
              theme={styles.theme}
              label="Positionen übernehmen"
              text={`${count} übernehmen`}
              primary
              disabled={count === 0 || saving.isPending}
              onPress={confirm}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

function Connections({
  styles,
  config,
}: {
  styles: Styles;
  config: { finnhub: boolean; telegram: boolean; model: boolean };
}) {
  const save = useRpc(saveConfig);
  const test = useRpc(testTelegram);
  const invalidate = useInvalidate();
  const [values, setValues] = useState<{
    finnhubKey?: string;
    telegramToken?: string;
    telegramChatId?: string;
  }>({});
  const saving = useMutation({
    mutationFn: () => save(values),
    onSuccess: () => {
      setValues({});
      void invalidate();
    },
  });
  const testing = useMutation({ mutationFn: () => test({}) });
  const setFinnhub = useCallback(
    (finnhubKey: string) => setValues((v) => ({ ...v, finnhubKey })),
    [],
  );
  const setToken = useCallback(
    (telegramToken: string) => setValues((v) => ({ ...v, telegramToken })),
    [],
  );
  const setChat = useCallback(
    (telegramChatId: string) => setValues((v) => ({ ...v, telegramChatId })),
    [],
  );
  const submit = useCallback(() => saving.mutate(), [saving]);
  const runTest = useCallback(() => testing.mutate(), [testing]);
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Verbindungen</Text>
      <Text style={styles.muted}>
        {`KI-Bewertung: ${config.model ? "verfügbar" : "Host-Update nötig"}. Finnhub: ${config.finnhub ? "verbunden" : "kein Key"}. Telegram: ${config.telegram ? "verbunden" : "nicht eingerichtet"}.`}
      </Text>
      <Field
        label="Finnhub-API-Key (kostenlos auf finnhub.io)"
        styles={styles}
        placeholder={config.finnhub ? "gespeichert, zum Ändern neu eingeben" : "API-Key"}
        secure
        onChange={setFinnhub}
      />
      <Field
        label="Telegram-Bot-Token (von @BotFather)"
        styles={styles}
        placeholder={config.telegram ? "gespeichert, zum Ändern neu eingeben" : "123456:ABC…"}
        secure
        onChange={setToken}
      />
      <Field
        label="Telegram-Chat-ID"
        styles={styles}
        placeholder="z. B. 123456789"
        onChange={setChat}
      />
      {saving.error || testing.error ? (
        <Text accessibilityRole="alert" style={styles.danger}>
          {(saving.error ?? testing.error)?.message}
        </Text>
      ) : null}
      {testing.isSuccess ? <Text style={styles.muted}>Testnachricht gesendet.</Text> : null}
      <View style={styles.row}>
        <Button
          theme={styles.theme}
          label="Verbindungen speichern"
          text={saving.isPending ? "Speichert…" : "Speichern"}
          primary
          disabled={saving.isPending || Object.keys(values).length === 0}
          onPress={submit}
        />
        <Button
          theme={styles.theme}
          label="Telegram testen"
          icon="Send"
          text="Telegram testen"
          disabled={!config.telegram || testing.isPending}
          onPress={runTest}
        />
      </View>
    </View>
  );
}

export function Settings({
  watchlist,
  config,
  styles,
}: {
  watchlist: Watchlist;
  config: { finnhub: boolean; telegram: boolean; model: boolean };
  styles: Styles;
}) {
  const remove = useRpc(removeEntry);
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState<(EntryDraft & { id?: string }) | null>(null);
  const removal = useMutation({
    mutationFn: (entry: Entry) => remove({ revision: watchlist.revision, id: entry.id }),
    onSettled: () => invalidate(),
  });
  const { mutate } = removal;
  const add = useCallback(
    () =>
      setDraft({
        name: "",
        kind: "holding",
        instrument: "stock",
        keywords: [],
        leverage: 1,
        ticker: "",
      }),
    [],
  );
  const done = useCallback(() => setDraft(null), []);
  return (
    <View style={styles.settings}>
      <Import watchlist={watchlist} styles={styles} />
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.labelGrow}>{`Positionen (${watchlist.entries.length})`}</Text>
          <Button
            theme={styles.theme}
            label="Position hinzufügen"
            icon="Plus"
            text="Hinzufügen"
            onPress={add}
          />
        </View>
        {draft ? (
          <EntryForm
            key={draft.id ?? "new"}
            draft={draft}
            watchlist={watchlist}
            styles={styles}
            onDone={done}
          />
        ) : null}
        {watchlist.entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            styles={styles}
            onEdit={setDraft}
            onRemove={mutate}
          />
        ))}
        {removal.error ? (
          <Text accessibilityRole="alert" style={styles.danger}>
            {removal.error.message}
          </Text>
        ) : null}
      </View>
      <Connections styles={styles} config={config} />
    </View>
  );
}
