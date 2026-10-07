import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, Text, View } from "react-native";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import {
  getOverlayRoot,
  OverlayLayerProvider,
  useGlobalWebOverlayLayer,
  useWebOverlayRegistration,
} from "../lib/overlay-root";
import {
  KEYBOARD_STATUS,
  useBottomSheetInternal,
  type BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { ArrowLeft, Search, X } from "@/components/icons/ui-icons";
import {
  IsolatedBottomSheetModal,
  type ContextBridge,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import {
  getBottomSheetVisibleContentHeight,
  getCompactSheetSafeAreaPadding,
} from "@/components/adaptive-modal-sheet-layout";
import { ScrollView } from "@/components/ui/scroll-view";
import { isWeb } from "@/constants/platform";
import { useKeyboardVisibility } from "@/hooks/use-keyboard-visibility";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdaptiveTextInput } from "@/components/adaptive-text-input";
export { AdaptiveTextInput, type AdaptiveTextInputProps } from "@/components/adaptive-text-input";

export const SHEET_HORIZONTAL_PADDING_SCALE = 6;

export const SHEET_HEADER_CLOSE_PADDING_SCALE = 2;

export interface SheetHeaderSearch {
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  resetKey?: string | number;
  placeholder?: string;
  autoFocus?: boolean;
  testID?: string;
}

export interface SheetHeaderBack {
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
}

export interface SheetHeader {
  title: string;
  subtitle?: ReactNode;
  back?: SheetHeaderBack;
  leading?: ReactNode;
  actions?: ReactNode;
  search?: SheetHeaderSearch;
}

const SCROLL_CONTENT_GROW = { flexGrow: 1 };
const ABSOLUTE_FILL_STYLE = { ...StyleSheet.absoluteFillObject };
const NATIVE_DIALOG_SNAP_POINTS = ["100%"];

const styles = StyleSheet.create((theme) => ({
  nativeDialogSurface: {
    flex: 1,
  },
  nativeDialogBackground: {
    backgroundColor: "transparent",
  },
  desktopOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing[6],
    pointerEvents: "auto" as const,
  },
  desktopCard: {
    overflow: "hidden",
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    flexShrink: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.surface2,
  },
  headerContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface2,
  },
  headerRow: {
    paddingHorizontal: theme.spacing[SHEET_HORIZONTAL_PADDING_SCALE],
    paddingVertical: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  headerBackButton: {
    borderRadius: theme.borderRadius.lg,
  },
  headerLeadingSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleGroup: {
    flex: 1,
    gap: theme.spacing[1],
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  closeButton: {
    padding: theme.spacing[SHEET_HEADER_CLOSE_PADDING_SCALE],
    borderRadius: theme.borderRadius.lg,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[SHEET_HORIZONTAL_PADDING_SCALE],
    paddingBottom: theme.spacing[3],
  },
  inlineHeaderRow: {
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  inlineSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  inlineTitle: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  desktopScrollContainer: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    position: "relative",
  },
  desktopScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  sheetContent: {
    padding: theme.spacing[SHEET_HORIZONTAL_PADDING_SCALE],
    gap: theme.spacing[4],
  },
  contentGrow: {
    flexGrow: 1,
  },
  compactStaticContent: {
    flex: 1,
    minHeight: 0,
  },
  bottomSheetVisibleContent: {
    minHeight: 0,
    overflow: "hidden",
  },
  bottomSheetVisibleScroll: {
    flex: 1,
    minHeight: 0,
  },
  desktopStaticContent: {
    flexShrink: 1,
    minHeight: 0,
  },
  footer: {
    paddingHorizontal: theme.spacing[SHEET_HORIZONTAL_PADDING_SCALE],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
}));

const WEB_EXIT_DURATION_MS = 160;

function SheetBackground({ style }: BottomSheetBackgroundProps) {
  const { theme } = useUnistyles();
  const combinedStyle = useMemo(
    () => [
      style,
      {
        backgroundColor: theme.colors.surface0,
        borderTopLeftRadius: theme.borderRadius["2xl"],
        borderTopRightRadius: theme.borderRadius["2xl"],
      },
    ],
    [style, theme.colors.surface0, theme.borderRadius],
  );
  return <Animated.View pointerEvents="none" style={combinedStyle} />;
}

function SheetContent({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[styles.sheetContent, style]}>{children}</View>;
}

function BottomSheetVisibleContent({ children }: { children: ReactNode }) {
  const { animatedDetentsState, animatedKeyboardState, animatedLayoutState, animatedPosition } =
    useBottomSheetInternal();
  const visibleContentStyle = useAnimatedStyle(() => {
    const { containerHeight, handleHeight } = animatedLayoutState.get();
    if (containerHeight < 0 || handleHeight < 0) {
      return { height: 0 };
    }

    const initialDetentPosition = animatedDetentsState.get().detents?.[0];
    const contentPosition =
      initialDetentPosition == null
        ? animatedPosition.get()
        : Math.min(animatedPosition.get(), initialDetentPosition);

    const keyboardState = animatedKeyboardState.get();
    return {
      height: getBottomSheetVisibleContentHeight({
        containerHeight,
        contentPosition,
        handleHeight,
        keyboardHeight: keyboardState.heightWithinContainer,
        isKeyboardVisible: keyboardState.status === KEYBOARD_STATUS.SHOWN,
      }),
    };
  }, [animatedDetentsState, animatedKeyboardState, animatedLayoutState, animatedPosition]);

  return (
    <Animated.View style={[styles.bottomSheetVisibleContent, visibleContentStyle]}>
      {children}
    </Animated.View>
  );
}

export function SheetHeaderView({
  header,
  onClose,
  showCloseButton = true,
  testID,
}: {
  header: SheetHeader;
  onClose: () => void;
  showCloseButton?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const back = header.back;
  const handleBackPress = back?.onPress;
  const search = header.search;
  const handleSearchChange = useCallback(
    (value: string) => {
      search?.onChange(value);
    },
    [search],
  );

  return (
    <View style={styles.headerContainer} testID={testID}>
      <View style={styles.headerRow}>
        {handleBackPress ? (
          <Pressable
            onPress={handleBackPress}
            hitSlop={8}
            style={styles.headerBackButton}
            accessibilityRole="button"
            accessibilityLabel={back?.accessibilityLabel ?? back?.label ?? t("common.actions.back")}
            testID="sheet-header-back"
          >
            {({ pressed }) => (
              <ArrowLeft
                size={18}
                color={pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            )}
          </Pressable>
        ) : null}
        {header.leading ? <View style={styles.headerLeadingSlot}>{header.leading}</View> : null}
        <View style={styles.headerTitleGroup}>
          <Text style={titleStyle} numberOfLines={1}>
            {header.title}
          </Text>
          {header.subtitle}
        </View>
        {header.actions ? <View style={styles.headerActions}>{header.actions}</View> : null}
        {showCloseButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.actions.close")}
            style={styles.closeButton}
            onPress={onClose}
          >
            {({ pressed }) => (
              <X
                size={16}
                color={pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            )}
          </Pressable>
        ) : null}
      </View>
      {search ? (
        <View style={styles.searchRow}>
          <Search size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
          <AdaptiveTextInput
            // @ts-expect-error - outlineStyle is web-only
            style={[styles.searchInput, isWeb && { outlineStyle: "none" }]}
            placeholder={search.placeholder ?? t("common.actions.search")}
            resetKey={search.resetKey}
            onChangeText={handleSearchChange}
            onFocus={search.onFocus}
            onBlur={search.onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={search.autoFocus}
            testID={search.testID}
          />
        </View>
      ) : null}
    </View>
  );
}

export function InlineHeaderView({ header }: { header: SheetHeader }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const back = header.back;
  const handleBackPress = back?.onPress;
  const hasInlineRow = Boolean(handleBackPress || header.leading || header.actions);
  if (!hasInlineRow && !header.search) return null;
  return (
    <View>
      {hasInlineRow ? (
        <View style={styles.inlineHeaderRow}>
          {handleBackPress ? (
            <Pressable
              onPress={handleBackPress}
              hitSlop={8}
              style={styles.headerBackButton}
              accessibilityRole="button"
              accessibilityLabel={
                back?.accessibilityLabel ?? back?.label ?? t("common.actions.back")
              }
              testID="sheet-header-back"
            >
              {({ pressed }) => (
                <ArrowLeft
                  size={16}
                  color={pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
                />
              )}
            </Pressable>
          ) : null}
          {header.leading ? <View style={styles.headerLeadingSlot}>{header.leading}</View> : null}
          <Text style={styles.inlineTitle} numberOfLines={1}>
            {header.title}
          </Text>
          {header.actions ? <View style={styles.headerActions}>{header.actions}</View> : null}
        </View>
      ) : null}
      {header.search ? (
        <View style={styles.inlineSearchRow}>
          <Search size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          <AdaptiveTextInput
            // @ts-expect-error - outlineStyle is web-only
            style={[styles.searchInput, isWeb && { outlineStyle: "none" }]}
            placeholder={header.search.placeholder ?? t("common.actions.search")}
            resetKey={header.search.resetKey}
            onChangeText={header.search.onChange}
            onFocus={header.search.onFocus}
            onBlur={header.search.onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={header.search.autoFocus}
            testID={header.search.testID}
          />
        </View>
      ) : null}
    </View>
  );
}

export interface AdaptiveModalSheetProps {
  header: SheetHeader;
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  footerContainerStyle?: StyleProp<ViewStyle>;
  snapPoints?: string[];
  testID?: string;
  desktopMaxWidth?: number;
  desktopHeight?: DimensionValue;
  scrollable?: boolean;
  presentation?: "push" | "replace";
  bodyStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  sizeContentToCurrentSnapPoint?: boolean;
  keyboardBehavior?: "extend" | "fillParent" | "interactive";
  contextBridge?: ContextBridge | null;
}

function resolveDesktopStaticStyle(height?: DimensionValue) {
  return height == null ? styles.desktopStaticContent : styles.compactStaticContent;
}

export function AdaptiveModalSheet({
  header,
  visible,
  onClose,
  onDismiss,
  children,
  footer,
  footerContainerStyle,
  snapPoints,
  testID,
  desktopMaxWidth,
  desktopHeight,
  scrollable = true,
  presentation,
  contentStyle,
  bodyStyle,
  sizeContentToCurrentSnapPoint = true,
  keyboardBehavior = "extend",
  contextBridge = null,
}: AdaptiveModalSheetProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardVisibility(visible);
  const resolvedSnapPoints = useMemo(() => snapPoints ?? ["65%", "90%"], [snapPoints]);
  const compactSafeAreaPadding = useMemo(
    () =>
      getCompactSheetSafeAreaPadding({
        isCompact: isMobile,
        isKeyboardVisible,
        hasFooter: Boolean(footer),
        safeAreaBottom: insets.bottom,
      }),
    [footer, insets.bottom, isKeyboardVisible, isMobile],
  );
  const bodyClearanceStyle = { paddingBottom: compactSafeAreaPadding.contentPaddingBottom ?? 0 };
  const footerClearanceStyle = useMemo(
    () => ({ paddingBottom: compactSafeAreaPadding.footerPaddingBottom ?? 0 }),
    [compactSafeAreaPadding.footerPaddingBottom],
  );
  const footerView = footer ? (
    <View style={footerClearanceStyle}>
      <View style={[styles.footer, footerContainerStyle]}>{footer}</View>
    </View>
  ) : null;
  const handleIndicatorStyle = useMemo(
    () => ({ backgroundColor: theme.colors.palette.zinc[600] }),
    [theme.colors.palette.zinc],
  );
  useEffect(() => {
    if (!isWeb && visible) {
      Keyboard.dismiss();
    }
  }, [visible]);

  const { sheetRef, handleSheetChange, handleSheetDismiss } = useIsolatedBottomSheetVisibility({
    visible,
    isEnabled: isMobile || !isWeb,
    onClose,
  });
  const [shouldRenderWeb, setShouldRenderWeb] = useState(visible);
  const [isWebClosing, setIsWebClosing] = useState(false);
  const modalLayer = useGlobalWebOverlayLayer("modal", isWeb && !isMobile && shouldRenderWeb);
  const handleDismiss = useCallback(() => {
    handleSheetDismiss();
    onDismiss?.();
  }, [handleSheetDismiss, onDismiss]);

  const desktopCardStyle = useMemo(
    () => [
      styles.desktopCard,
      desktopHeight != null && { height: desktopHeight },
      desktopMaxWidth != null && { maxWidth: desktopMaxWidth },
    ],
    [desktopMaxWidth, desktopHeight],
  );
  const desktopOverlayStyle = useMemo(
    () => [
      styles.desktopOverlay,
      isWeb && {
        zIndex: modalLayer,
        opacity: isWebClosing ? 0 : 1,
        transitionDuration: `${WEB_EXIT_DURATION_MS}ms`,
        transitionProperty: "opacity",
        transitionTimingFunction: "ease",
      },
    ],
    [isWebClosing, modalLayer],
  );

  const handleWebOverlayKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return true;
    },
    [onClose],
  );
  const setWebOverlayScope = useWebOverlayRegistration({
    active: isWeb && !isMobile && visible,
    layer: modalLayer,
    onKeyDown: handleWebOverlayKeyDown,
  });

  useEffect(() => {
    if (!isWeb || isMobile) return;
    if (visible) {
      setShouldRenderWeb(true);
      setIsWebClosing(false);
      return;
    }
    if (!shouldRenderWeb) return;
    setIsWebClosing(true);
    const timeout = window.setTimeout(() => {
      setShouldRenderWeb(false);
      setIsWebClosing(false);
      onDismiss?.();
    }, WEB_EXIT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [visible, isMobile, onDismiss, shouldRenderWeb]);

  if (isMobile) {
    const sheetContent = (
      <>
        <SheetHeaderView header={header} onClose={onClose} testID={testID} />
        <View style={[styles.compactStaticContent, bodyStyle]}>
          {scrollable ? (
            <ScrollView
              style={styles.bottomSheetVisibleScroll}
              contentContainerStyle={SCROLL_CONTENT_GROW}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.contentGrow, bodyClearanceStyle]}>
                <SheetContent style={[styles.contentGrow, contentStyle]}>{children}</SheetContent>
              </View>
            </ScrollView>
          ) : (
            <View style={[styles.compactStaticContent, bodyClearanceStyle]}>
              <SheetContent style={[styles.compactStaticContent, contentStyle]}>
                {children}
              </SheetContent>
            </View>
          )}
        </View>
        {footerView}
      </>
    );

    return (
      <IsolatedBottomSheetModal
        ref={sheetRef}
        contextBridge={contextBridge}
        snapPoints={resolvedSnapPoints}
        index={0}
        enableDynamicSizing={false}
        onChange={handleSheetChange}
        onDismiss={handleDismiss}
        backdropOpacity={0.45}
        enablePanDownToClose
        backgroundComponent={SheetBackground}
        handleIndicatorStyle={handleIndicatorStyle}
        keyboardBehavior={keyboardBehavior}
        keyboardBlurBehavior="restore"
        accessible={false}
        presentation={presentation}
      >
        {sizeContentToCurrentSnapPoint ? (
          <BottomSheetVisibleContent>{sheetContent}</BottomSheetVisibleContent>
        ) : (
          sheetContent
        )}
      </IsolatedBottomSheetModal>
    );
  }

  const desktopStaticStyle = resolveDesktopStaticStyle(desktopHeight);
  const cardInner = (
    <OverlayLayerProvider layer={modalLayer}>
      <SheetHeaderView header={header} onClose={onClose} />
      <View style={[scrollable ? styles.desktopScrollContainer : desktopStaticStyle, bodyStyle]}>
        {scrollable ? (
          <ScrollView
            style={styles.desktopScroll}
            contentContainerStyle={SCROLL_CONTENT_GROW}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <SheetContent style={[styles.contentGrow, contentStyle]}>{children}</SheetContent>
          </ScrollView>
        ) : (
          <SheetContent style={[desktopStaticStyle, contentStyle]}>{children}</SheetContent>
        )}
      </View>
      {footerView}
    </OverlayLayerProvider>
  );

  const desktopContent = (
    <View style={desktopOverlayStyle} testID={testID}>
      <Pressable
        accessibilityLabel={t("common.actions.dismiss")}
        style={ABSOLUTE_FILL_STYLE}
        onPress={onClose}
      />
      <View
        ref={setWebOverlayScope}
        style={desktopCardStyle}
        role="dialog"
        aria-modal
        tabIndex={-1}
      >
        {cardInner}
      </View>
    </View>
  );

  if (isWeb && typeof document !== "undefined") {
    if (!shouldRenderWeb) return null;
    return createPortal(desktopContent, getOverlayRoot());
  }

  return (
    <IsolatedBottomSheetModal
      ref={sheetRef}
      contextBridge={contextBridge}
      snapPoints={NATIVE_DIALOG_SNAP_POINTS}
      index={0}
      enableDynamicSizing={false}
      onChange={handleSheetChange}
      onDismiss={handleDismiss}
      handleComponent={null}
      backgroundStyle={styles.nativeDialogBackground}
      enablePanDownToClose={false}
      enableHandlePanningGesture={false}
      enableContentPanningGesture={false}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      accessible={false}
      presentation={presentation}
    >
      <View style={styles.nativeDialogSurface}>{desktopContent}</View>
    </IsolatedBottomSheetModal>
  );
}
