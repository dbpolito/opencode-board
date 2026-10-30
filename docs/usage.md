# Usage guide

## Manual installation

You can add the package manually to `plugins` in your global `~/.config/opencode/opencode.jsonc`, preserving your existing settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-board"]
}
```

OpenCode installs the package and loads its Desktop GUI.

## Tasks and columns

The default columns are Backlog, Ready, In progress, Review, and Done. Drag column titles to reorder them. Columns can collapse into narrow rails when you need the space.

Create a card with **New task** or the **+** in a column header. Tasks have a title, Markdown description, labels, a column, and an optional project. Cards show a description excerpt, checklist progress, and the number of linked sessions.

Drag anywhere on a card to reorder it or move it between columns. Changes save when you drop; Escape cancels a drag. Clear the filters before dragging so hidden cards don't make the order ambiguous.

Deleting a task requires confirmation. Its Delete icon is beside Edit in task details. Deleting a column with tasks asks where to move them, and you can't delete the last column.

The header count includes every card, even when the board is filtered. It updates as you add or delete tasks; an ellipsis appears while storage loads.

## Markdown checklists

Click checkboxes directly in the rendered description. Each click updates the matching `- [ ]` or `- [x]` in the saved Markdown, and the card's progress count follows it.

The description editor has Write and Preview tabs. Rendering uses OpenCode's Markdown component.

## Projects and filters

Use search, labels, or the project filter to narrow the board. **All projects** shows the shared backlog; **No project** shows unassigned tasks.

The project picker lists projects with an open session at their root directory. Worktree tabs are excluded. It uses OpenCode's project display name, with the folder name as a fallback. Closing a project's last root session removes it from the picker but leaves its tasks and assignments alone.

New tasks default to the filtered project. When you're viewing all projects, they default to the currently open project. You can change the assignment or choose no project in the task editor.

## Linked sessions

**Start session** creates a session, links it to the card, and immediately sends a short instruction with the task title and ID, followed by its description. The instruction asks the agent to mark checkboxes as it completes them; the `board_update` tool explains how to save each change. It does not open a draft for review.

The new session inherits the launching conversation's selected provider, model, and variant instead of picking a server default. If the conversation has no stored selection, the plugin uses its last assistant message's model; without either, it asks you to select a model first. The target server must support that model and have working credentials.

New sessions run in the task's assigned project and server. A task without a project uses the currently open session's directory and server. Existing session links keep their own server when you change the task's project.

**Link current session** adds the conversation you're already in. Duplicate links are ignored. Each task supports multiple linked sessions; click a title to open one. The unlink icon removes the connection from the task without deleting the session.

A card's border animates while any linked session is running. Selecting a card doesn't start the animation. Reduced-motion preferences disable the rotation. Task status stays manual: starting or finishing a session won't move the card. Deleting a task doesn't delete its sessions. Existing single-session links remain available.

## Task layouts

The task-layout menu controls how details open:

| Layout | Behavior |
| --- | --- |
| Overlay | Details sit over the board. Clicking the backdrop closes them. |
| Split | The board and details sit side by side. |
| Full | Details use the board's available content area. |

The same layout applies when creating or editing a task. Overlay and Split widths can be resized and are saved separately. Focus the resize divider to use the arrow keys, Shift for larger steps, Home, or End. Double-click it to reset the width.

The Overlay backdrop covers the task panel, including search and filters. Clicking it closes the details without activating the control underneath. You can use the prompt composer elsewhere in OpenCode and leave the task open. Task menus and confirmation dialogs remain usable. Split and Full have no backdrop.

## Storage

Cards and view preferences use OpenCode's global plugin storage. They are shared across projects, servers, sessions, and windows in the same local app installation. They survive reloads but don't sync to other machines.

There is no automatic task clearing or import from former workspace stores. If you used the earlier `opencode-desktop-showcase` package, the plugin imports its global board and layout preferences once, only when `opencode-board` has no saved value yet.
