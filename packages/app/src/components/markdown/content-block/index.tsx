import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputSelectionChangeEventData,
  type TextStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  Copy,
  Pencil,
  TextBold,
  TextHeading,
  TextItalic,
  Undo2,
} from "@/components/icons/ui-icons";
import { Button } from "@/components/ui/button";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isNative, isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { markdownCopyDataSet, TRAILING_CODE_LINE_BREAKS } from "@/assistant-selection-copy/markup";
import type { MarkdownFenceRendererProps } from "../fence/types";
import { MarkdownRenderer } from "../renderer";
import { copyPlainContent, copyRichContent } from "./clipboard";
import { useContentBlockEdits } from "./edit-store";
import { toggleHeading, wrapSelection, type EditResult, type TextSelection } from "./editor";
import { contentBlockHtml, contentBlockPlainText } from "./format";
import { isRichContentBlock, parseContentBlockInfo, type ContentBlockKind } from "./info";

interface ContentBlockProps extends MarkdownFenceRendererProps {
  info: string | null | undefined;
  blockKey?: string;
}

type CopyMode = "formatted" | "plain" | "markdown";

const COPIED_RESET_MS = 1500;
const EDITOR_PADDING = 8;
const EDITOR_HEIGHT_EXTRA = isWeb ? 2 : EDITOR_PADDING * 2 + 2;
const WEB_SELECTABLE: TextStyle = isWeb ? ({ userSelect: "text" } as TextStyle) : {};

function copyContent(mode: CopyMode, body: string, rich: boolean): Promise<void> {
  if (mode === "markdown" || !rich) return copyPlainContent(body);
  if (mode === "plain") return copyPlainContent(contentBlockPlainText(body));
  return copyRichContent({ html: contentBlockHtml(body), plain: contentBlockPlainText(body) });
}

function useCopiedFlag(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );
  const flag = useCallback(() => {
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => {
      setCopied(false);
      resetRef.current = null;
    }, COPIED_RESET_MS);
  }, []);
  return [copied, flag];
}

const kindLabelKeys = {
  text: "message.contentBlock.text",
  rich: "message.contentBlock.text",
  email: "message.contentBlock.email",
  document: "message.contentBlock.document",
  prompt: "message.contentBlock.prompt",
} as const satisfies Record<ContentBlockKind, string>;

export function ContentBlock({ code, info, phase, inheritedStyles, blockKey }: ContentBlockProps) {
  const { t } = useTranslation();
  const parsed = parseContentBlockInfo(info);
  const kind = parsed?.kind ?? "text";
  const rich = isRichContentBlock(kind);
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);

  const original = useMemo(() => code.replace(TRAILING_CODE_LINE_BREAKS, ""), [code]);
  const editKey = blockKey ?? `${info ?? ""}\n${original}`;
  const { body, isEdited, handleChange, handleReset } = useBlockEdit(editKey, original);
  const canEdit = phase === "complete";
  const controlsVisible = isHovered || isNative || isCompact || editing;

  const subject = kind === "email" ? (parsed?.title ?? null) : null;
  const toggleEditing = useCallback(() => setEditing((value) => !value), []);

  const bodyStyle = useVerbatimBodyStyle(inheritedStyles);

  let content: React.ReactNode = <Text style={bodyStyle}>{body}</Text>;
  if (editing) content = <ContentBlockEditor value={body} rich={rich} onChange={handleChange} />;
  else if (rich) content = <MarkdownRenderer text={body} compact />;

  const title = parsed?.title ?? t(kindLabelKeys[kind]);

  return (
    <View
      style={styles.container}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      testID={`content-block-${kind}`}
    >
      <View style={styles.header} dataSet={markdownCopyDataSet.ignore}>
        <ContentBlockTitle
          title={title}
          prefix={subject ? t("message.contentBlock.email") : null}
          edited={isEdited}
        />
        <View
          style={[styles.actions, controlsVisible ? styles.visible : styles.hidden]}
          pointerEvents={controlsVisible ? "auto" : "none"}
        >
          <EditControls
            isEdited={isEdited}
            canEdit={canEdit}
            editing={editing}
            onToggle={toggleEditing}
            onReset={handleReset}
          />
          <CopyControls body={body} rich={rich} subject={subject} />
        </View>
      </View>
      {content}
    </View>
  );
}

function CopyControls({
  body,
  rich,
  subject,
}: {
  body: string;
  rich: boolean;
  subject: string | null;
}) {
  const { t } = useTranslation();
  const [copied, flagCopied] = useCopiedFlag();
  const copy = useCallback(
    (mode: CopyMode) => {
      if (body) void copyContent(mode, body, rich).then(flagCopied);
    },
    [body, rich, flagCopied],
  );
  const copyDefault = useCallback(() => copy("formatted"), [copy]);
  const copySubject = useCallback(() => {
    if (subject) void copyPlainContent(subject).then(flagCopied);
  }, [subject, flagCopied]);
  return (
    <>
      {subject ? (
        <Button
          variant="ghost"
          size="xs"
          onPress={copySubject}
          accessibilityLabel={t("message.contentBlock.copySubject")}
        >
          {t("message.contentBlock.copySubject")}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        leftIcon={copied ? Check : Copy}
        onPress={copyDefault}
        accessibilityLabel={t(copied ? "message.contentBlock.copied" : "message.contentBlock.copy")}
      />
      {rich ? <CopyModeMenu onCopy={copy} /> : null}
    </>
  );
}

function useVerbatimBodyStyle(inheritedStyles: TextStyle) {
  return useMemo(() => {
    const { fontFamily: _fontFamily, ...prose } = inheritedStyles;
    const fontSize = prose.fontSize;
    return [
      styles.body,
      prose,
      WEB_SELECTABLE,
      fontSize !== undefined ? { lineHeight: Math.round(fontSize * 1.5) } : null,
    ];
  }, [inheritedStyles]);
}

function useBlockEdit(editKey: string, original: string) {
  const edited = useContentBlockEdits((state) => state.edits[editKey]);
  const setEdit = useContentBlockEdits((state) => state.setEdit);
  const resetEdit = useContentBlockEdits((state) => state.resetEdit);
  const handleChange = useCallback((value: string) => setEdit(editKey, value), [editKey, setEdit]);
  const handleReset = useCallback(() => resetEdit(editKey), [editKey, resetEdit]);
  return { body: edited ?? original, isEdited: edited !== undefined, handleChange, handleReset };
}

function EditControls({
  isEdited,
  canEdit,
  editing,
  onToggle,
  onReset,
}: {
  isEdited: boolean;
  canEdit: boolean;
  editing: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {isEdited ? (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={Undo2}
          onPress={onReset}
          accessibilityLabel={t("message.contentBlock.reset")}
        />
      ) : null}
      {canEdit ? (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={editing ? Check : Pencil}
          onPress={onToggle}
          accessibilityLabel={t(
            editing ? "message.contentBlock.done" : "message.contentBlock.edit",
          )}
        />
      ) : null}
    </>
  );
}

function ContentBlockTitle({
  title,
  prefix,
  edited,
}: {
  title: string;
  prefix: string | null;
  edited: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.titleRow}>
      {prefix ? <Text style={styles.titleLabel}>{prefix}:</Text> : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {edited ? <Text style={styles.titleLabel}>{t("message.contentBlock.edited")}</Text> : null}
    </View>
  );
}

function CopyModeMenu({ onCopy }: { onCopy: (mode: CopyMode) => void }) {
  const { t } = useTranslation();
  const copyFormatted = useCallback(() => onCopy("formatted"), [onCopy]);
  const copyPlain = useCallback(() => onCopy("plain"), [onCopy]);
  const copyMarkdown = useCallback(() => onCopy("markdown"), [onCopy]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={styles.menuTrigger}
        accessibilityRole="button"
        accessibilityLabel={t("message.contentBlock.copyOptions")}
      >
        <ChevronDown size={14} color={styles.icon.color} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" offset={4} width={220}>
        <DropdownMenuItem onSelect={copyFormatted}>
          {t("message.contentBlock.copyFormatted")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyPlain}>
          {t("message.contentBlock.copyPlain")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyMarkdown}>
          {t("message.contentBlock.copyMarkdown")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ContentBlockEditor = React.memo(function ContentBlockEditor({
  value,
  rich,
  onChange,
}: {
  value: string;
  rich: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<EditingTextInputHandle>(null);
  const [initialValue] = useState(value);
  const selection = useRef<TextSelection>({ start: value.length, end: value.length });
  useEffect(() => {
    const end = initialValue.length;
    input.current?.replaceText(initialValue, { start: end, end });
  }, [initialValue]);
  const [contentHeight, setContentHeight] = useState(0);
  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const next = Math.ceil(event.nativeEvent.contentSize.height);
      setContentHeight((current) => (Math.abs(current - next) > 1 ? next : current));
    },
    [],
  );
  const inputStyle = useMemo(
    () => [styles.input, contentHeight ? { height: contentHeight + EDITOR_HEIGHT_EXTRA } : null],
    [contentHeight],
  );
  const handleSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selection.current = event.nativeEvent.selection;
    },
    [],
  );
  const apply = useCallback(
    (edit: (text: string, range: TextSelection) => EditResult) => {
      const result = edit(input.current?.getText() ?? value, selection.current);
      input.current?.replaceText(result.value, result.selection);
      selection.current = result.selection;
      onChange(result.value);
      input.current?.focus();
    },
    [onChange, value],
  );
  const bold = useCallback(
    () => apply((text, range) => wrapSelection(text, range, "**", t("message.contentBlock.bold"))),
    [apply, t],
  );
  const italic = useCallback(
    () => apply((text, range) => wrapSelection(text, range, "*", t("message.contentBlock.italic"))),
    [apply, t],
  );
  const heading = useCallback(() => apply(toggleHeading), [apply]);
  return (
    <View style={styles.editor}>
      {rich ? (
        <View style={styles.toolbar}>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={TextBold}
            onPress={bold}
            accessibilityLabel={t("message.contentBlock.bold")}
          />
          <Button
            variant="ghost"
            size="xs"
            leftIcon={TextItalic}
            onPress={italic}
            accessibilityLabel={t("message.contentBlock.italic")}
          />
          <Button
            variant="ghost"
            size="xs"
            leftIcon={TextHeading}
            onPress={heading}
            accessibilityLabel={t("message.contentBlock.heading")}
          />
        </View>
      ) : null}
      <EditingTextInput
        ref={input}
        initialValue={initialValue}
        onChangeText={onChange}
        onSelectionChange={handleSelectionChange}
        onContentSizeChange={handleContentSizeChange}
        multiline
        autoFocus
        scrollEnabled={false}
        textAlignVertical="top"
        accessibilityLabel={t("message.contentBlock.editorLabel")}
        style={inputStyle}
      />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    marginVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minHeight: 32,
    paddingTop: theme.spacing[1],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 1,
    minWidth: 0,
  },
  titleLabel: {
    flexShrink: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    marginRight: -theme.spacing[1],
  },
  visible: {
    opacity: 1,
  },
  hidden: {
    opacity: 0,
  },
  menuTrigger: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  icon: {
    color: theme.colors.foregroundMuted,
  },
  body: {
    color: theme.colors.foreground,
  },
  editor: {
    gap: theme.spacing[1],
  },
  toolbar: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  input: {
    minHeight: 120,
    padding: EDITOR_PADDING,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.base,
    lineHeight: Math.round(theme.fontSize.base * 1.5),
  },
}));
