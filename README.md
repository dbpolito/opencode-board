# OpenCode Task Board

A Kanban board for OpenCode Desktop, using native components and theme colors. Targets `@opencode/plugin` 2.2.0; the GUI plugin API is experimental.

## Build and load

```sh
bun install
bun run build
```

Add this directory to `plugins` in your global `~/.config/opencode/opencode.jsonc`, preserving your existing settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-plugin"]
}
```

Local builds reload the plugin automatically. Use `bun run dev` to rebuild on changes.

## Open the board

In an existing session, click the **Kanban icon and card count** on the right of the session header. The count includes every card in the global board, across projects and servers, and updates as tasks change. An ellipsis appears while storage loads.

You can also use **Kanban: Open task board** in the command palette, `/kanban`, or **Task board** in the side-panel **+** menu. Drag the board tab below the chat for more horizontal room.

## Tasks and columns

- Create tasks from **New task** or the **+** in a column header.
- Edit titles, Markdown descriptions, labels, and status. Cards show excerpts and checklist progress. Click checkboxes directly in the rendered description to update and save the Markdown (`- [ ]` / `- [x]`).
- One global board: projects are optional task fields, not separate boards. Assign a project in the editor, then filter by **All projects**, a specific project, or **No project**. Project choices include only projects with open root-directory session tabs, excluding worktree tabs. Labels use OpenCode's project display name, falling back to the folder name when unnamed. Closing a project's last root session removes it from the picker, not from existing tasks. New tasks default to the filtered project, or the currently open project when viewing all projects.
- Search or filter by label and project. Clear filters before dragging.
- Drag whole cards to reorder them or move between columns. Drag column titles to reorder columns. Changes save on drop; Escape cancels.
- Add, rename, recolor, or collapse columns. Deleting a populated column requires moving its tasks; the last column cannot be deleted.
- Choose **Overlay**, **Split**, or **Full** from the task-layout menu. Overlay and Split widths are resizable and saved separately. The focused resize divider also supports arrows, Shift, Home, End, and double-click reset.

Session linking is optional, and each task can have multiple linked sessions. **Start session** creates and adds a session, then immediately sends only the card title and description to begin work. **Link current session** adds an existing session without duplicates. Each linked title opens its session; its unlink icon removes only that link. Cards show the session count and animate when any linked session is running. Selection remains static, and reduced-motion preferences disable rotation. Task status is always manual. Existing single-session links remain available.

The Delete icon sits beside Edit in task details. Deleting requires confirmation and does not delete linked sessions.

Starting a session uses the task's assigned project and server. Tasks without a project use the currently open session's directory and server. Linked sessions retain their own server, even when you change a task's project.

## Persistence

The board and view preferences use OpenCode's global plugin storage, shared across projects, servers, sessions, and windows in this local app installation. This does not sync to other machines. Former workspace boards are imported once as you open a session in each workspace, with project assignments and session links preserved. The old stores are left untouched; deleted imported tasks will not reappear. The package's historical name, `opencode-desktop-showcase`, is kept for storage identity; no showcase features remain.

## Development

```sh
bun run check
```

Runs TypeScript checks, builds `dist/gui-experimental.cjs`, and runs board-model, Markdown/checklist, storage, and bundle-registration tests. Tests do not verify Desktop rendering or pointer geometry; check those in OpenCode Desktop.

Source files live under `src/gui/`: `window.tsx` registers the board, `board-shortcut.tsx` provides the header action, `kanban-storage.ts` shares global storage and imports old boards, and `kanban.tsx`, `task-detail.tsx`, `resizable-detail.tsx`, and `kanban.css` implement the UI.

Reference: [OpenCode V2 GUI plugin documentation](https://opencode.ai/v2/docs/build/plugins/gui).
