import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { askAlert } from "../shared/contracts.ts";
import {
  directionLabels,
  pricedLabels,
  strengthLabels,
  type Alert,
  type Entry,
  type Quote,
} from "../shared/model.ts";
import { Button } from "./controls.tsx";
import { delay, directionColor, time, type Styles } from "./styles.ts";

function leverageText(entry?: Entry) {
  if (!entry) return "";
  if (entry.leverage < 0) return `Short, Hebel ${Math.abs(entry.leverage)}`;
  if (entry.leverage !== 1) return `Hebel ${entry.leverage}`;
  return "ohne Hebel";
}

function PriceBars({ start, end, styles }: { start: Quote; end: Quote; styles: Styles }) {
  const c = styles.theme.colors;
  const change = ((end.price - start.price) / start.price) * 100;
  const color = change >= 0 ? c.statusSuccess : c.statusDanger;
  const bars = useMemo(() => {
    const max = Math.max(start.price, end.price);
    const min = Math.min(start.price, end.price) * 0.995;
    const height = (price: number) => 12 + ((price - min) / (max - min || 1)) * 36;
    return {
      before: {
        width: 14,
        height: height(start.price),
        borderRadius: 3,
        backgroundColor: c.foregroundMuted,
      },
      after: { width: 14, height: height(end.price), borderRadius: 3, backgroundColor: color },
    };
  }, [start.price, end.price, color, c.foregroundMuted]);
  const label = useMemo(() => [styles.strong, { color }], [styles.strong, color]);
  return (
    <View style={styles.row}>
      <View style={styles.bars}>
        <View style={bars.before} />
        <View style={bars.after} />
      </View>
      <View style={styles.grow}>
        <Text style={label}>{`${change >= 0 ? "+" : ""}${change.toFixed(2)} % seit Eingang`}</Text>
        <Text style={styles.muted}>
          {`${start.price} → ${end.price}, Tagesänderung ${end.changePercent.toFixed(2)} %`}
        </Text>
      </View>
    </View>
  );
}

function PriceReaction({ alert, styles }: { alert: Alert; styles: Styles }) {
  if (!alert.priceAtReceipt || !alert.priceLatest)
    return <Text style={styles.muted}>Keine Kursdaten für diesen Basiswert.</Text>;
  return <PriceBars start={alert.priceAtReceipt} end={alert.priceLatest} styles={styles} />;
}

function RelatedItem({
  alert,
  styles,
  onOpen,
}: {
  alert: Alert;
  styles: Styles;
  onOpen(id: string): void;
}) {
  const open = useCallback(() => onOpen(alert.id), [onOpen, alert.id]);
  const color = directionColor(styles.theme, alert.direction);
  const dot = useMemo(() => [styles.dot, { backgroundColor: color }], [styles.dot, color]);
  return (
    <Pressable accessibilityRole="button" onPress={open} style={styles.relatedItem}>
      <View style={styles.row}>
        <View style={dot} />
        <Text style={styles.textGrow} numberOfLines={2}>
          {alert.summary}
        </Text>
        <Text style={styles.muted}>{time(alert.publishedAt)}</Text>
      </View>
    </Pressable>
  );
}

function Ask({ alert, styles }: { alert: Alert; styles: Styles }) {
  const ask = useRpc(askAlert);
  const cache = useQueryClient();
  const [question, setQuestion] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const mutation = useMutation({
    mutationFn: () => ask({ id: alert.id, question }),
    onSuccess: () => {
      setQuestion("");
      setInputKey((key) => key + 1);
      void cache.invalidateQueries({ queryKey: ["aktien-state"] });
    },
  });
  const { mutate } = mutation;
  const submit = useCallback(() => {
    if (question.trim().length >= 2) mutate();
  }, [question, mutate]);
  const c = styles.theme.colors;
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Frag nach</Text>
      {alert.chat.map((message) => (
        <View
          key={`${message.at}-${message.role}`}
          style={message.role === "user" ? styles.bubbleUser : styles.bubbleAnswer}
        >
          <Text style={styles.text}>{message.text}</Text>
        </View>
      ))}
      {mutation.isPending ? <Text style={styles.muted}>Antwort wird erstellt…</Text> : null}
      {mutation.error ? (
        <Text accessibilityRole="alert" style={styles.danger}>
          {mutation.error.message}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          key={inputKey}
          style={styles.input}
          placeholder="z. B. Was heißt das für meinen Hebel?"
          placeholderTextColor={c.foregroundMuted}
          accessibilityLabel="Frage zur Meldung"
          onChangeText={setQuestion}
          onSubmitEditing={submit}
          editable={!mutation.isPending}
        />
        <Button
          theme={styles.theme}
          label="Frage senden"
          icon="Send"
          primary
          disabled={mutation.isPending || question.trim().length < 2}
          onPress={submit}
        />
      </View>
    </View>
  );
}

export function Detail({
  alert,
  entry,
  related,
  styles,
  onOpen,
  onBack,
}: {
  alert: Alert;
  entry?: Entry;
  related: Alert[];
  styles: Styles;
  onOpen(id: string): void;
  onBack?: () => void;
}) {
  const color = directionColor(styles.theme, alert.direction);
  const badge = useMemo(() => [styles.badge, { borderColor: color }], [styles.badge, color]);
  const badgeText = useMemo(() => [styles.badgeText, { color }], [styles.badgeText, color]);
  return (
    <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
      {onBack ? (
        <View style={styles.row}>
          <Button
            theme={styles.theme}
            label="Zurück zum Feed"
            icon="ArrowLeft"
            text="Feed"
            onPress={onBack}
          />
        </View>
      ) : null}
      <View style={styles.wrap}>
        <View style={badge}>
          <Text style={badgeText}>{directionLabels[alert.direction]}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{`Stärke ${strengthLabels[alert.strength]}`}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{`Eingepreist: ${pricedLabels[alert.priced]}`}</Text>
        </View>
      </View>
      <Text style={styles.lead}>{alert.summary}</Text>
      <View style={styles.section}>
        <Text
          style={styles.label}
        >{`Einordnung für ${entry?.name ?? "die Position"}, ${leverageText(entry)}`}</Text>
        <Text style={styles.text}>{alert.reasoning}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Zeitstrahl</Text>
        <Text style={styles.text}>{`Veröffentlicht ${time(alert.publishedAt)}`}</Text>
        <Text
          style={styles.text}
        >{`Angekommen ${time(alert.receivedAt)}, ${delay(alert)} später`}</Text>
        <PriceReaction alert={alert} styles={styles} />
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Quelle</Text>
        <ExternalLink href={alert.url} accessibilityLabel={`Originalquelle öffnen: ${alert.title}`}>
          <Text style={styles.link}>{alert.title}</Text>
        </ExternalLink>
        <Text
          style={styles.muted}
        >{`${alert.domain}, über ${alert.source === "finnhub" ? "Finnhub" : "GDELT"}`}</Text>
      </View>
      {related.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>Verwandte Meldungen</Text>
          {related.map((item) => (
            <RelatedItem key={item.id} alert={item} styles={styles} onOpen={onOpen} />
          ))}
        </View>
      ) : null}
      <Ask key={alert.id} alert={alert} styles={styles} />
    </ScrollView>
  );
}
