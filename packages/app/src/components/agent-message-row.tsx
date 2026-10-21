import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentMessage } from "@getpaseo/protocol/agent-message";
import { ChevronRight } from "@/components/icons/ui-icons";
import { AnimatedDisclosure } from "@/components/ui/animated-disclosure";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";

const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const VERB_KEYS = {
  message: "message.agentMessage.received",
  finished: "message.agentMessage.finished",
  errored: "message.agentMessage.errored",
  "permission-required": "message.agentMessage.permissionRequired",
  closed: "message.agentMessage.closed",
} as const satisfies Record<AgentMessage["event"], string>;

interface AgentMessageRowProps {
  message: AgentMessage;
  serverId?: string;
  agentId?: string;
  isLastInSequence?: boolean;
}

export const AgentMessageRow = memo(function AgentMessageRow({
  message,
  serverId,
  agentId,
  isLastInSequence = false,
}: AgentMessageRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const senderId = message.sender.id;
  const senderAgent = useSessionStore((state) => {
    const session = serverId ? state.sessions[serverId] : undefined;
    return session?.agents.get(senderId) ?? session?.agentDetails.get(senderId);
  });
  const sender =
    message.sender.title ?? senderAgent?.title ?? t("message.agentMessage.anotherSession");
  const canOpenSender = Boolean(senderAgent) && senderId !== agentId;

  const accessibilityState = useMemo(() => ({ expanded: open }), [open]);
  const toggle = useCallback(() => setOpen((previous) => !previous), []);
  const openSender = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      if (serverId) navigateToAgent({ serverId, agentId: senderId });
    },
    [serverId, senderId],
  );

  return (
    <View
      testID="agent-message-row"
      style={[styles.container, isLastInSequence && styles.containerLast]}
    >
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel={t(open ? "message.agentMessage.hide" : "message.agentMessage.show", {
          sender,
        })}
        style={styles.header}
      >
        <Text style={styles.verb} numberOfLines={1}>
          {t(VERB_KEYS[message.event])}
        </Text>
        {canOpenSender ? (
          <Pressable
            onPress={openSender}
            accessibilityRole="link"
            testID="agent-message-sender"
            style={styles.senderLink}
          >
            <Text style={styles.sender} numberOfLines={1}>
              {sender}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.sender, styles.senderLink]} numberOfLines={1}>
            {sender}
          </Text>
        )}
        <View style={open ? styles.chevronOpen : styles.chevron}>
          <ThemedChevronRight size={14} uniProps={mutedColorMapping} />
        </View>
      </Pressable>
      <AnimatedDisclosure open={open}>
        <Text selectable style={styles.body} testID="agent-message-body">
          {message.text}
        </Text>
      </AnimatedDisclosure>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    marginBottom: theme.spacing[1],
  },
  containerLast: {
    marginBottom: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    minWidth: 0,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[1],
  },
  verb: {
    flexShrink: 0,
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  senderLink: {
    flexShrink: 1,
    minWidth: 0,
  },
  sender: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  chevron: {
    flexShrink: 0,
  },
  chevronOpen: {
    flexShrink: 0,
    transform: [{ rotate: "90deg" }],
  },
  body: {
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[2],
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.content,
    lineHeight: Math.round(theme.fontSize.content * 1.4),
    color: theme.colors.foreground,
  },
}));
