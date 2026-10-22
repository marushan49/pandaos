# Mail Breeze Design

Mail Breeze turns incoming mail into small tasks for an agent. It is calm, airy and a little playful. The interface is German.

## Character

- Summer breeze: sage, mint and sky tints on the host's own surfaces, never a second dark or light theme.
- One companion: the clay panda from `shared/panda-image.ts`. It appears in the hero and in empty states, floats slowly, and stands still when the OS asks for reduced motion.
- Quiet hierarchy: weight and color carry importance, not size. One accent button per surface (`theme.colors.accent`, set by the user in Appearance).

## Color

Text, surfaces, borders, accent and status colors come from `theme.colors`. The four breeze tints in `client/theme.ts` (`sage`, `mint`, `sky`, `sun`) are decorative only. They always appear with alpha (`alpha()`), so they sit on light and dark hosts alike, and they never carry meaning alone. Status is always a label plus an icon plus a tint.

| Status      | Label          | Icon                  |
| ----------- | -------------- | --------------------- |
| ready       | Bereit         | Inbox                 |
| working     | In Arbeit      | Wind                  |
| needs_input | Braucht dich   | MessageCircleQuestion |
| done        | Erledigt       | CheckCheck            |
| failed      | Fehlgeschlagen | TriangleAlert         |
| dismissed   | Verworfen      | EyeOff                |

Demo data carries a yellow Demo pill on every task and a banner with a removal button. Demo is never hidden.

## Honesty rules

- `working` shows a spinner only because the task really is running. No progress bar, no percentages, no invented steps.
- A result or error is shown only when the task has one.
- Outlook disconnected is stated plainly, with what still works (manual import, demo data). Without an application registration, show the setup state and a route to settings instead of a login button that fails. Microsoft setup comes first in settings. RPC transport metadata stays out of user-facing errors.
- No reply, draft or send control exists anywhere.
- Toasts show only IDs and status changes that appear after the first loaded state (`client/notices.ts`). Demo tasks never raise a toast.

## Layout

| Surface                           | Behavior                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Screen, wide                      | Hero, tabs, filter bar, then a 400 px task list beside the detail view. Each pane scrolls on its own. |
| Screen, compact                   | One scrolling column. The list and the detail swap, with a "Zur Liste" button.                        |
| Workspace panel                   | Always the compact layout, with a smaller hero. Opens in the workspace or the explorer.               |
| Short wide windows (under 760 px) | The hero shrinks so the panes keep room.                                                              |

Tabs: Aufgaben, Postfach (Gmail first, then Outlook, demo data, manual import), Einstellungen (context, project directory, people, Microsoft app).

Controls are at least 44 px high on compact layouts and 38 px on wide ones. Chips and buttons carry `accessibilityRole`, state and labels. Inputs have visible labels, and the login code is spoken digit by digit.

Text that can be long shrinks with `minWidth: 0`. Pills, icons and times use `flexShrink: 0`.

## Mailbox tab

One connection is active at a time (`connection.provider`). Without that field, a live connection counts as Outlook. The provider that is not active shows a one-line explanation and no connect form.

Gmail runs through a reader agent, so its card shows the agent's state, the last read, the next run and a button that opens the agent. Polling follows `reader.status`. The privacy note in the Gmail card is always visible: the connected Gmail access of the Codex Business profile, mail text processed by OpenAI (reader) and Anthropic (task agent), Codex quota use, and that disconnecting stops only Mail Breeze. It makes no promise about read-only access, because no technical limit is proven.

## Entry points

- Sidebar header row "Mail Breeze" (Lucide `Wind`).
- Screen `main`. Params: `taskId` opens that task, `action=import` opens the import form, and a changing `nonce` reopens it while the screen is already open.
- Workspace panel `panel`.
- Command Center: "Mail Breeze öffnen", "Postfach jetzt lesen", "Mail manuell importieren".

## Files

| File                            | Role                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/theme.ts`               | Breeze tints, spacing, status looks                                                                                                                |
| `client/kit.tsx`                | Surface, Button, Chip, Field, Pill, Banner, Row                                                                                                    |
| `client/api.ts`                 | One query for the state, one mutation path, polling every 3 s while busy, every 10 s while a mailbox is connected, 3 s while the Gmail reader runs |
| `client/notices.ts`             | Toasts for new IDs and outcomes                                                                                                                    |
| `client/hero.tsx`               | Greeting, counts, connection pill, panda                                                                                                           |
| `client/tasks.tsx`              | Filters, list, detail, result and source mail                                                                                                      |
| `client/gmail.tsx`              | Gmail form, reader status, privacy note                                                                                                            |
| `client/connection.tsx`         | Mailbox tab: Outlook login, demo data, import entry                                                                                                |
| `client/preferences.tsx`        | Editable context, people, directory and app registration                                                                                           |
| `client/import-modal.tsx`       | Manual mail import form                                                                                                                            |
| `client/main.tsx`, `screen.tsx` | App shell for the screen and the panel                                                                                                             |

## Open for later

- Mobile checks on a real phone and the Electron panel location are not done yet.
- The task has no source flag, so manual imports look like synced mail except for the missing Outlook link.
- Dismissed tasks cannot be restored because the contract has no such call.
