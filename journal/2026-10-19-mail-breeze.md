# Mail Breeze

## Goal and acceptance

Build an independent PandaOS plugin that turns incoming email into work, without drafting or sending email replies. Claude owns the visual design: calm summer breeze, panda companion, desktop and compact layouts. Completion requires a loaded plugin, real task import/deduplication, a dedicated Claude task run, visible outcome/error states, and saved browser evidence. Outlook authorization remains a user account boundary; demo data must be labeled.

## Evidence and decisions

- Verified: current SDK supports screens, sidebar contributions, RPC, installation-owned dataDirectory, agent creation and lifecycle events.
- Verified: root checkout has unrelated edits; work isolated in `.worktrees/mail-breeze`, branch `feat/mail-breeze`.
- Verified against the Microsoft references below: Graph delegated Mail.Read with device login is implemented. Account authorization remains unconfirmed.
- Verified: Microsoft application registration and Gmail mailbox access. Unconfirmed: native mobile/desktop system notification delivery. Microsoft login requires administrator approval.
- Scope: plugin source `mail-breeze/`; no changes to daemon/core or existing work.

## Checkpoint

2026-10-20: Gmail integration complete on this host. User confirmed existing forwarding to marushan49@gmail.com. Account and direct read-only Codex App Server access verified; no model turn during retrieval, no new credentials. Gmail connected and settings survived plugin reload. Queue1537 passed formatter, lint0, plugin typecheck,16/16 focused tests and reload. Tests cover delayed indexing, 10-minute overlap bounded by connectedAt, message deduplication, failed-read recovery after restart outside the current window, account mismatch and the three-tool whitelist. Failed message IDs stay persisted with at most five retries per run; they do not block other messages. Deliberate review disposition: retain visible unresolved failures rather than silently discard unread mail after an arbitrary attempt count. Permanently deleted/unreadable IDs keep the error state until resolved or disconnected; documented in README.

Browser evidence: evr_74bc1921-a059-49a2-b2ea-2689dc5a1f17 passed connected account plus real Jetzt lesen after final reload; evr_cf4e5986-7677-41be-beb3-1f69a0f0a545 passed wide Gmail view with zero failed requests. Compact and wide screenshots inspected. Recipes mail-breeze-gmail-read and mail-breeze-gmail-wide saved. Historical39console errors retained; no clean-console claim. Initial stale disconnected UI after external connection was reconciled by reload; mutation errors now invalidate state so the server state can recover without a manual reload. Disk shows provider gmail, status connected, no pending retries. No newly arrived forwarded mail since connecting, so live arrival-to-task is not confirmed; real Claude task execution was verified earlier using a labeled demo. No messages sent, drafted or modified. Outlook remains available but still requires administrator approval; no tenant policy changed.

No root build jobs or heartbeats pending. Preview945983 on127.0.0.1:4699, plugin browser1792423225777-b3ed8641e7f61f9a and useful Microsoft tabs stay open. Claude design/reviewer8aada5e2-6710-49d1-b436-5ee8068301e1 and Gmail probe1f7fca7b-6f2b-40af-bed1-575b49b66d92 remain open, finished. Native/Mac/mobile client rollout and native system notifications remain unverified. No commit or push performed. Source remains isolated in this worktree; node_modules is an untracked dependency symlink and must not be committed.

- Queue1516 passed: formatter, lint0, plugin typecheck,9/9focused tests, plugin reload running. Queue1517 passed formatter/lint/typecheck/reload after fixing stale device-code display on cancellation; real browser cancellation regression passed evr_1112b8fc-2a40-45ad-b876-0be09dca1c95.
- Real Claude demo task completed: a6b0e5ad9ea59e31c09d5544, agent5a3f3af2-dcb2-45cb-891e-0ea39b3fc81c. Verified sum450 and growth50%; no mail draft or send. Task agent remains open.
- Browser verification passed for wide result, compact navigation and the corrected Outlook setup path. Latest evidence: evr_22283ec3-b972-4576-a6bc-171e99ef280a. Setup opens the Microsoft section in settings; visible page contains no RPC metadata. Screenshot visually inspected. Zero failed requests;39historical console errors remain from earlier preview diagnostics, so no clean-console claim.
- Browser tab1792423225777-b3ed8641e7f61f9a and loopback preview127.0.0.1:4699 remain open. Preview process945983, exec29894. No active build jobs. Heartbeat1c5341d0 removed. Follow-up heartbeate31e0268 removed after its first follow-up: no user answer or new admin authorization received. Further progress requires user/admin input; no automatic follow-up remains. No device-code polling remains after cancellation.
- Installed native/Mac/mobile clients and OS notifications remain unverified. Existing compatible web export was reused; fresh renderer export failed at the host heap limit and was not retried unchanged.

## Microsoft registration

- Verified application **Mail Breeze**, client ID `<client-id>`, object ID `<object-id>`, work tenant, single tenant. Existing applications were checked first; no Mail Breeze existed.
- Verified configured Graph scopes are delegated `Mail.Read` and `User.Read`, no mail writing/sending or application permissions. No client secret or redirect URI added. No tenant-wide admin consent granted. Public client flows saved and read back true after navigation.
- Preferences saved through the real plugin UI. Device-code start passed browser run `evr_18c5d8bb-05cf-47a7-879b-b5457c7523a7`.
- The work account is already signed in. Microsoft explicitly requires administrator approval for this app; evidence `evr_c7b75dbd-7c80-4e1e-b4a0-814dac85732f`. No password or MFA entered. Pending login canceled so no expiring code runs unattended.
- New persistent browser tabs: Entra `1792425384099-dba18a1dbdeac3b4` on Mail Breeze API permissions; Microsoft authorization `1792425679933-c5d54703106d53ac` on admin-approval page. Keep open. Microsoft-goal-created transient tab disappeared from host listing; persistent replacement created, no agent-requested close.

## Microsoft references

-2026-10-20: User screenshots confirm delegatedMail.Read/User.Read both show Admin consent requiredNo and disabled grant-admin-consent button. This is the default permission classification, not a completed consent grant. Official Microsoft user-consent documentation confirms tenant settings can restrict user consent even for permissions that do not require admin consent by default: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent?pivots=portal . Exact tenant consent policy remains uninspected; prior actual Need admin approval response remains the verified blocker. No tenant policy or permissions changed. Documentation browser1792451827189-1b09d8cf7c8afc54 kept open.

- Verified protocol fields: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code
- Verified inbox delta/cursor contract: https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0
- Image generated with built-in image tool: relaxed panda holding mint envelope, bamboo and a sage cloud, transparent background. Saved project asset; no external image host.

## Integration checkpoint

- Plugin installed successfully on Zotac: runtime mail-breeze running, source worktree/mail-breeze; queue1500.
- Unit checks5/5 passed queue1492, typecheck passed1496. Lint found151 errors; Claude fixes client, root fixes server. No disabling rules.
- Actual installed Linux renderer is0.11.0 and rejects plugin>=0.11.2. Building one fresh browser renderer for verification, without changing installed clients.
- Own preview: Python aiohttp same-origin proxy on127.0.0.1:4699, exec68009. Local credential stays server-side, same auth asCLI; never in browser storage. Target tab1792423225777-b3ed8641e7f61f9a.
- Heartbeat1c5341d0 active. Claude8aada5e2-6710-49d1-b436-5ee8068301e1 fixing lint.

- Queue1501 browser export failed because fresh worktree had no generated highlight/protocol/plugin artifacts. Proper build:app-deps plus single export now queued; no resource limits changed. Backend lint passed1503; new lifecycle test fixture omitted run receipt and was corrected.

- Final scoped checks queue1507: formatter, lint0errors, plugin typecheck,7/7focused tests all passed. Plugin reloaded running.
- Dependencies queue1506 emitted needed local frontend artifacts but exited2on pre-existing ACP SDK type mismatches in packages/plugin/src/server/acp-internal/connection.ts. No unrelated core code changed. Browser export runs separately against generated artifacts; this dependency-stack check is not claimed green.

## Triage statt Agent pro Mail (2026-10-20)

- Anlass: Jede Gmail-Mail startete automatisch einen Claude-Sonnet-high-Agenten. Von 16 Mails waren 15 nur Info und eine war eine echte Aufgabe (Website-Fehler).
- Entscheidung (Marushan): Nur noch GPT-6 Luna automatisch einsetzen, daraus To-dos ableiten und im Plugin anzeigen.
- Umsetzung: Mails mit Precedence bulk/list/junk oder Auto-Submitted werden ohne Modell verworfen. Übrige automatische Mails ordnet ein Batch-Lauf `codex-plus/gpt-6-luna` low ein (max. 10 pro Lauf). Wichtige Mails landen unter needs_input mit `todos`, unwichtige unter dismissed. Claude startet nur noch manuell über „Claude bearbeiten lassen“.
- Checks: Queue 1691 bestanden mit oxfmt, oxlint 0, Typecheck und 19/19 Tests. Plugin neu geladen, Status running.
- Kopfzeilenprüfung, nur lesend über GmailClient: Bei den 16 echten Mails hatten 4 List-Unsubscribe oder List-Id (Newsletter und Dienst-Mails), keine hatte Precedence oder Auto-Submitted. Luna stufte eine Frist-Mail davon als wichtig ein. Deshalb gilt List-Unsubscribe/List-Id nicht mehr als Ausschlusskriterium.
- Luna-Test: Agent c97fb297 (codex-plus/gpt-6-luna, auto, low), Workspace wks_7d3377591ba8dfb0. Der Plugin-Parser übernahm 4/4 Einstufungen: Zwei Mails wichtig mit 2 bzw. 1 To-do, eine Frist-Mail wichtig mit 1, eine Shop-Mail unwichtig. Agent bleibt offen.
- UI nicht im Browser geprüft: Der installierte Renderer 0.11.0 lehnt das Plugin ab, die Vorschau auf 4699 ist nicht mehr erreichbar.
- Fehlgeschlagene Einordnung: "Erneut versuchen" setzt die Mail zurück auf ready, und Luna ordnet sie beim nächsten Abruf neu ein. Claude startet dabei nicht. Queue 1693 bestanden mit Lint 0, 20/20 Tests und Typecheck. Plugin neu geladen. Nichts committet.
- Wichtigkeit entscheidet Marushan: Neues Einstellungsfeld "Was ist für dich wichtig?" (preferences.importance, max. 4000 Zeichen). Es fließt mit Vorrang in den Luna-Prompt ein. Queue 1694 bestanden mit Lint 0, 21/21 Tests und Typecheck. Plugin neu geladen. Die UI ist nicht im Browser geprüft.
