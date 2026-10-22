import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ClaudeAccountLoginState } from "@getpaseo/protocol/provider-account-login";
import type { MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";

interface AccountFormSnapshot {
  provider?: string;
  name: string;
  description: string;
  sharedTeam: boolean;
}

export interface AccountFormRuntime {
  client: Pick<DaemonClient, "claudeAccountLogin"> | null;
  patchConfig: (patch: MutableDaemonConfigPatch) => Promise<unknown>;
  complete: (provider: string) => void;
  failureMessage: string;
}

interface AccountFormState extends AccountFormSnapshot {
  code: string;
  loginState: ClaudeAccountLoginState | null;
  error: string | null;
  busy: boolean;
  connected: boolean;
  waiting: boolean;
}

export function openProviderAccountForm(snapshot: AccountFormSnapshot) {
  let state: AccountFormState = {
    ...snapshot,
    code: "",
    loginState: null,
    error: null,
    busy: false,
    connected: false,
    waiting: false,
  };
  let runtime: AccountFormRuntime;
  let loginId: string | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  function publish(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
    state.waiting =
      state.loginState?.status === "starting" || state.loginState?.status === "waiting";
    for (const listener of listeners) listener();
  }

  function fail(error: unknown) {
    if (closed) return;
    const message = error instanceof Error ? error.message : runtime.failureMessage;
    publish({ error: message, loginState: { status: "error", message } });
  }

  async function accept(result: Awaited<ReturnType<DaemonClient["claudeAccountLogin"]>>) {
    const client = runtime.client;
    loginId = result.loginId;
    if (closed) {
      if (loginId && client)
        await client.claudeAccountLogin({ kind: "cancel", loginId }).catch(() => {});
      return;
    }
    publish({
      loginState: result.state,
      error: result.state.status === "error" ? result.state.message : null,
    });
    if (result.state.status === "complete") {
      loginId = null;
      runtime.complete(result.state.provider);
    } else if (state.waiting && loginId && client) {
      const id = loginId;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void client.claudeAccountLogin({ kind: "status", loginId: id }).then(accept).catch(fail);
      }, 1500);
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyRuntime(value: AccountFormRuntime) {
      runtime = value;
      if (state.connected !== Boolean(value.client)) publish({ connected: Boolean(value.client) });
    },
    setName: (name: string) => publish({ name }),
    setDescription: (description: string) => publish({ description }),
    setSharedTeam: (sharedTeam: boolean) => publish({ sharedTeam }),
    setCode: (code: string) => publish({ code }),
    setError(error: unknown) {
      if (!closed)
        publish({ error: error instanceof Error ? error.message : runtime.failureMessage });
    },
    async save() {
      const client = runtime.client;
      if (state.busy || !client || !state.name.trim()) return;
      publish({ busy: true, error: null });
      try {
        if (snapshot.provider) {
          await runtime.patchConfig({
            providers: {
              [snapshot.provider]: {
                label: state.name.trim(),
                description: state.description.trim(),
                accountPolicy: state.sharedTeam ? "shared-team-9elf26-memory" : "standard",
              },
            },
          });
          if (!closed) runtime.complete(snapshot.provider);
        } else {
          await accept(
            await client.claudeAccountLogin({
              kind: "start",
              name: state.name.trim(),
              description: state.description.trim(),
              sharedTeam: state.sharedTeam,
            }),
          );
        }
      } catch (error) {
        fail(error);
      } finally {
        if (!closed) publish({ busy: false });
      }
    },
    async submitCode() {
      const client = runtime.client;
      if (!client || !loginId || !state.code.trim() || state.busy) return;
      publish({ busy: true, error: null });
      try {
        await accept(
          await client.claudeAccountLogin({ kind: "code", loginId, code: state.code.trim() }),
        );
        if (!closed) publish({ code: "" });
      } catch (error) {
        fail(error);
      } finally {
        if (!closed) publish({ busy: false });
      }
    },
    close() {
      closed = true;
      clearTimeout(timer);
      listeners.clear();
      if (loginId && runtime.client)
        void runtime.client.claudeAccountLogin({ kind: "cancel", loginId }).catch(() => {});
    },
  };
}
