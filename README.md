# OpenCode Board

A Kanban board inside OpenCode Desktop. Keep your backlog beside your conversations, write tasks in Markdown, and start a session from a card when you're ready to work on it.

The board is shared across your projects. Each task can have a project and several linked sessions, so you can keep the planning and the conversations together as work moves along.

[npm](https://www.npmjs.com/package/opencode-board) · [GitHub](https://github.com/dbpolito/opencode-board) · [MIT license](LICENSE)

## Install

Add the package to `plugins` in your global `~/.config/opencode/opencode.jsonc`, preserving your existing settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-board"]
}
```

OpenCode installs the package and loads its Desktop GUI. Open a session, then click the Kanban icon beside the card count on the right of the session header.

You can also open it through:

- **Kanban: Open task board** in the command palette.
- `/kanban` in the composer.
- **Task board** in the side-panel **+** menu.

Drag the board tab below the chat if you want more horizontal room. The header count includes every card, even when the board is filtered. It updates as you add or delete tasks; an ellipsis appears while storage loads.

This plugin is for OpenCode Desktop and does not add a CLI/TUI interface. It targets `@opencode/plugin` 2.2.0. The GUI plugin API is experimental.

## Working with the board

The default columns are Backlog, Ready, In progress, Review, and Done. Add your own columns, rename or recolor them, and drag their titles to change the order. Columns can collapse into narrow rails when you need the space.

Create a card with **New task** or the **+** in a column header. Tasks have a title, Markdown description, labels, a column, and an optional project. Cards show a description excerpt, checklist progress, and the number of linked sessions.

Drag anywhere on a card to reorder it or move it between columns. Changes save when you drop; Escape cancels a drag. Clear the filters before dragging so hidden cards don't make the order ambiguous.

Deleting a task requires confirmation. Deleting a column with tasks asks where to move them, and you can't delete the last column.

### Markdown checklists

Click checkboxes directly in the rendered description. Each click updates the matching `- [ ]` or `- [x]` in the saved Markdown, and the progress count on the card follows it.

The description editor has Write and Preview tabs. Rendering uses OpenCode's Markdown component, so descriptions follow the rest of the app.

### Projects and filters

Use search, labels, or the project filter to narrow the board. **All projects** shows the shared backlog; **No project** shows unassigned tasks.

The project picker lists projects with an open session at their root directory. Worktree tabs are excluded. It uses OpenCode's project display name, with the folder name as a fallback. Closing a project's last root session removes it from the picker but leaves its tasks and assignments alone.

New tasks default to the filtered project. When you're viewing all projects, they default to the currently open project. You can change the assignment or choose no project in the task editor.

## Tasks and sessions

A task can stand on its own or have multiple linked sessions. In task details:

- **Start session** creates a session, links it to the card, and sends the card title and description.
- **Link current session** adds the conversation you're already in. Duplicate links are ignored.
- Click a linked session's title to open it. The unlink icon removes that connection from the task.

> **Start session begins work immediately.** It sends the title and description as the prompt, without opening a draft for review.

New sessions run in the task's assigned project and server. A task without a project uses the currently open session's directory and server. Existing session links keep their own server when you change the task's project.

A card's border animates while any of its linked sessions is running. Selecting a card doesn't start the animation. Reduced-motion preferences disable the rotation.

Task status stays manual: a session starting or finishing won't move the card to another column. Deleting a task doesn't delete its sessions. Existing single-session links remain available.

## Task details

Click a card to open its details. The task-layout menu lets you choose how much of the board stays visible:

| Layout | Behavior |
| --- | --- |
| Overlay | Details sit over the board. Clicking the backdrop closes them. |
| Split | The board and details sit side by side. |
| Full | Details use the board's available content area. |

The same layout applies when creating or editing a task. Overlay and Split widths can be resized and are saved separately. Focus the resize divider to use the arrow keys, Shift for larger steps, Home, or End. Double-click it to reset the width.

The Overlay backdrop covers the task panel, including search and filters. Clicking it closes the details without activating the control underneath. You can still use the prompt composer elsewhere in OpenCode and leave the task open. Task menus and confirmation dialogs remain usable. Split and Full have no backdrop.

The Delete icon sits beside Edit in task details.

## Where your data lives

Cards and view preferences use OpenCode's global plugin storage. They are shared across projects, servers, sessions, and windows in the same local app installation. They survive reloads, but don't sync to other machines.

There is no automatic task clearing or import from former workspace stores. If you used the earlier `opencode-desktop-showcase` package, the plugin imports its global board and layout preferences once, only when `opencode-board` has no saved value yet.

## Development

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

Run the checks before submitting a change:

```sh
bun run check
```

This runs TypeScript checks, builds `dist/gui-experimental.cjs`, and runs the board-model, Markdown/checklist, storage, and bundle-registration tests. Desktop rendering and pointer geometry need a manual check in OpenCode Desktop.

The source is under `src/gui/`. `window.tsx` registers the plugin UI, `kanban.tsx` handles the board, and `task-detail.tsx` renders task details. Storage is in `kanban-storage.ts`; the header shortcut is in `board-shortcut.tsx`. Resizing and styles live in `resizable-detail.tsx` and `kanban.css`.

See the [OpenCode V2 GUI plugin documentation](https://opencode.ai/v2/docs/build/plugins/gui) for the host APIs.

## Publishing

The `prepublishOnly` hook runs the checks and builds the GUI before publishing. The npm package contains the built bundle, README, package metadata, and MIT license.

Sign in before publishing:

```sh
npm login
npm publish
```

For subsequent releases, increment the version, validate the package, commit and tag the release, then publish:

```sh
npm version patch --no-git-tag-version
npm publish --dry-run
git add package.json
git commit -m "Release next version"
git tag -a "v$(node -p 'require("./package.json").version')" -m "Release"
git push --follow-tags
npm publish
```

## License

[MIT](LICENSE)
