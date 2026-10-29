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

This runs TypeScript checks, builds `dist/gui-experimental.cjs`, and runs the board-model, Markdown/checklist, storage, and bundle-registration tests. Desktop rendering and pointer geometry need a manual check in OpenCode Desktop.

When checking the UI, try adding a task and reloading, moving cards between columns, resizing details, and toggling a Markdown checkbox. The header count should follow task additions and deletions without a refresh.

## Source layout

The entry point is `src/gui.tsx`. Most of the code is under `src/gui/`:

| File | Purpose |
| --- | --- |
| `window.tsx` | Registers the board, commands, and header shortcut. |
| `kanban.tsx` | Board, filters, editors, and drag interactions. |
| `kanban-model.ts` | Schemas and task/column helpers. |
| `kanban-storage.ts` | Global board storage. |
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

For publishing, see [Releasing](releasing.md).
