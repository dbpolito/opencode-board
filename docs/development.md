# Development

The plugin targets `@opencode/plugin` 2.2.0. See the [OpenCode V2 GUI plugin documentation](https://opencode.ai/v2/docs/build/plugins/gui) for the host APIs.

## Local setup

Build a local copy:

```sh
bun install
bun run build
```

To load it, add the local directory to `plugins` in your global `~/.config/opencode/opencode.jsonc` in place of the npm package:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-board"]
}
```

Local builds reload the plugin automatically. Use `bun run dev` to rebuild on changes.

## Testing

```sh
bun run check
```

This runs TypeScript checks, builds the GUI/server/RPC entries, and runs the board-model, Markdown/checklist, storage, tool, bridge-queue, and bundle-registration tests. A bundle integration test sends server tool calls through OpenCode's JSON-schema RPC validation and JSON serialization into the GUI's setup-owned store. Keep that transport boundary in the test: calling handlers directly misses non-JSON values such as explicitly present `undefined` fields. Desktop rendering, real RPC routing, and persistence still need a manual check in OpenCode Desktop.

When checking the UI, try adding a task and reloading, moving cards between columns, resizing details, and toggling a Markdown checkbox. The header count should follow task additions and deletions without a refresh.

## Source layout

The GUI entry point is `src/gui.tsx`; `src/server.ts` registers agent tools, and `src/rpc.ts` defines their Desktop transport. `src/bridge-queue.ts` holds short-lived requests shared across server location instances. `src/board-tools.ts` defines tool inputs and task operations. Most UI code is under `src/gui/`:

| File | Purpose |
| --- | --- |
| `window.tsx` | Registers the board, commands, and header shortcut. |
| `kanban.tsx` | Board, filters, editors, and drag interactions. |
| `kanban-model.ts` | Schemas and task/column helpers. |
| `kanban-storage.ts` | Global board storage. |
| `board-bridge.ts` | Claims tool requests from connected servers and applies them to the shared store. |
| `task-detail.tsx` | Task details and session actions. |
| `start-session.ts` | Creates a session, links it, and sends the task prompt. |
| `task-projects.ts` | Resolves project choices from open sessions. |
| `task-markdown.ts` | Description excerpts and checklist parsing. |
| `task-markdown-view.tsx` | Interactive checkboxes in rendered Markdown. |
| `task-markdown-checkboxes.ts` | Maps rendered checkboxes to Markdown markers. |
| `board-shortcut.tsx` | Header action and live task count. |
| `resizable-detail.tsx` | Task-pane resizing. |
| `kanban.css` | Scoped styles using OpenCode theme tokens. |

The board, header shortcut, and session actions share one store opened during plugin setup. Keep that shared handle when adding new views so counts and task changes stay in sync.

The bridge polls connected servers every 500 ms while storage is ready. The first active window handles requests until its heartbeat expires. Requests are claimed once and are not redelivered after cancellation or timeout. No durable task data is stored on the server.

The setup-owned `settings-v1` store holds global GUI preferences, separate from the task store. `settings.tsx` provides the native settings page. Heartbeats mirror `toolsEnabled` to the server, where `tool-settings.ts` persists `tools-enabled` and refreshes each location's tool registry when it changes. Executors also check the flag so previously captured tool snapshots cannot bypass disabling.

Wait requests run concurrently with the bridge's regular request loop, so a long wait doesn't block mutations or heartbeats. Cancellation is forwarded to Desktop on the next bridge poll, where it aborts native session wait/context requests. `board-wait.ts` reads idle outcomes without treating every idle session as successful.

`card-motion.ts` measures rendered cards by task ID and animates inert visual copies on a board-level layer. This lets cards travel across column clipping boundaries even when Solid remounts them. Real sortable nodes are never reparented or transformed by this animation. Flights are cancelled on scrolling, resizing, dragging, reduced-motion changes, and unmount. Geometry tests use a fake DOM; actual Desktop animation still needs a visual check.

`bun run build:server` rebuilds the server and RPC entries. `bun run dev` builds those entries once and then watches the GUI; run `build:server` again after server-only edits.

For a manual tool check, keep Desktop connected, ask an agent to list the board, create a task, move it to position 0 within a column, move it to another column, edit a Markdown checkbox, and link the conversation. Test `board_start_session` too: it should immediately send the title/description in a linked session without opening a tab by default; `open: true` opens a background tab. It uses the task's project, or the calling session's directory when unassigned. Confirm the board and header update, then reload and confirm the task survives. Close Desktop and confirm tools report that it is unavailable rather than creating a separate board.

For publishing, see [Releasing](releasing.md).
