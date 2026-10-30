# Agent tools

The plugin adds nine tools to OpenCode conversations. You can ask things like:

- “Create a task for the login bug with these reproduction steps.”
- “Move this task to Review.”
- “Put the login bug at position 0 in Ready.”
- “Mark the first checkbox complete and link this conversation.”
- “Start a session to work on the login bug.”

## Availability

**Settings → OpenCode Board → Enable agent tools** controls all nine tools and defaults to on. Turning it off removes the tools from connected servers and blocks new calls from older tool snapshots. Re-enabling restores them without a restart. The preference is saved globally in Desktop and mirrored to each connected server so it survives server restarts. Disconnected servers receive changes when Desktop reconnects.

The board UI remains usable when tools are disabled. Already-running sessions and waits are not automatically stopped, but agents can no longer use board tools to update checklists while they are disabled.

OpenCode Desktop must be open with the plugin enabled and connected to the conversation's server. The board panel can be closed. For conversations on a remote server, that server also needs the plugin installed.

The tools operate on the existing global Desktop board. Tasks are not copied into a separate server database, and nothing is migrated or cleared. Closing Desktop makes the tools unavailable; they do not provide a headless board. A TUI or web conversation can use them while Desktop remains connected to the same server, but this does not add a board UI to those clients.

Use one Desktop installation per server for this bridge. Connecting separate machines to the same server does not synchronize their boards; the first active Desktop bridge handles requests. Within one installation, a single window handles tool requests at a time.

Task edits and session unlinking use the `board_update` permission action, with the task ID as the resource (`new` for creation). Starting a session uses `board_start_session`; deleting a task uses the separate `board_remove` permission action. Read operations do not request a write permission. The tools do not delete sessions, manage columns, or change task status automatically.

## Tools

### `board_list`

Returns column IDs/titles and task metadata in board order, including each task's zero-based `position` within its column. Positions are calculated before filtering, so a filtered result keeps its actual board position. Descriptions are omitted; use `board_get` for full Markdown.

Optional filters combine:

- `query`: case-insensitive title, description, or label search.
- `column_id`: a column ID returned by this tool.
- `label`: an exact label.
- `project_directory`: a project path; an empty string selects unassigned tasks. Omit it for all projects.

### `board_get`

Requires `task_id`. Returns the full task, including Markdown, project, session links, column-relative `position`, and its `updatedAt` timestamp when present. Create, update, and move results also include `position`.

### `board_create`

Requires `title`. Optional fields are `description`, `labels` (comma-separated), `column_id`, and `project`.

The default is an unassigned task at the bottom of the first column. A project has `{ server, directory, name? }`; `server` is the Desktop server ID, such as `sidecar`. Use an existing task's project metadata when assigning to the same project. Creation does not link or start a session.

### `board_update`

Requires `task_id`. Changes only the supplied `title`, `description`, `labels`, or `project`. Set `project` to `null` to unassign a task.

Read a task before editing its description. `description` replaces the entire Markdown, so changing `- [ ]` to `- [x]` also updates checklist progress in the UI. There is no separate checklist tool.

Optionally pass the task's `updatedAt` as `expected_updated_at` to reject an edit if someone changed the task after it was read. For older tasks without a timestamp, use `0`. On a conflict, read the task again and reapply the intended edit.

### `board_move`

Requires `task_id`. Optional fields:

- `column_id`: destination column; omit it to keep the current column.
- `position`: zero-based final position within the destination column. `0` is the top, `1` is second, and so on. Other tasks shift automatically. Omit it to append at the bottom; positions past the end also append.

For example, to raise a task's priority without changing its status:

```json
{
  "task_id": "login-bug-id",
  "position": 0
}
```

To move it into another column at a specific position:

```json
{
  "task_id": "login-bug-id",
  "column_id": "ready",
  "position": 2
}
```

Positions must be non-negative integers. For a move within the same column, the task is removed first, then inserted at the requested final position. Moves preserve the task's other details; positions are derived from board order rather than stored as a separate priority field.

### `board_link_session`

Requires `task_id`. Links the calling conversation, preserving its server. Set `unlink` to `true` to remove that conversation's link. Repeated links do not create duplicates.

To unlink a different session, supply its `session_id` and `server` from `board_get`'s links:

```json
{
  "task_id": "task-id",
  "unlink": true,
  "session_id": "linked-session-id",
  "server": "sidecar"
}
```

Omitting `session_id` targets the calling conversation; omitting `server` uses the calling server. Only that exact session/server link is removed, leaving other links untouched. Linking or unlinking never stops or deletes a session.

### `board_start_session`

Requires `task_id`. Creates a session, links it to the task, and immediately sends this instruction followed by the unchanged Markdown description:

```text
Work on board task "<title>" (task_id: <id>). Mark checkboxes as you complete.
```

The `board_update` tool description explains how to read the latest task and check off each completed item without replacing unrelated content. Checklist updates depend on the agent following these instructions and having permission to use the tool. There is no draft or review step before sending.

The new session uses the task's assigned project/server. An unassigned task uses the calling conversation's directory/server, not whichever tab happens to be focused in Desktop.

It inherits the calling conversation's selected provider, model, and variant at creation, before the prompt is sent. For older conversations without a stored selection, it uses the most recent assistant message's model. If neither is available, starting fails with a request to select a model rather than using an unrelated server default. The model and credentials must be available on the task's target server.

The optional `open` flag defaults to `false`: the session starts without opening a tab. Set `open: true` to open it in a background tab, keeping the calling conversation focused. You can also open it later from the task's session links. The UI's **Start session** button still opens and focuses the new session.

Returns `task_id`, `session_id`, `server`, `directory`, and the inherited `model`. The task stays in its current column and position. Each completed call starts a new session, so do not retry blindly if the response is lost; inspect the task's links first.

### `board_remove`

Requires `task_id`. Permanently deletes that task, including its description and session links. Linked sessions are not stopped or deleted; no separate unlink call is needed before removal. Other tasks keep their relative order.

Returns `{ "task_id": "task-id", "removed": true }`. An unknown task ID produces an error. This action uses OpenCode's `board_remove` permission, not the UI's delete-confirmation dialog.

### `board_wait`

Requires `task_id`. Waits for the task's currently linked sessions to become idle, using OpenCode's native wait API rather than repeated status polling. Already-idle sessions return immediately. Links are captured when waiting begins; linking another session later doesn't add it to that wait.

Optional fields:

- `session_id` and `server`: target one linked session. If `server` is omitted, use the calling server.
- `timeout_seconds`: an integer from 1 to 3600, defaulting to 120.

The calling conversation is excluded to prevent waiting on itself. A task with no other matching links returns an error. Waiting works across connected servers and does not open tabs, change columns, or stop sessions.

Returns `task_id`, `timed_out`, `all_succeeded`, and a `sessions` array. Each session includes its ID, server, latest outcome, and last assistant reply when available. Outcomes distinguish `succeeded`, `failed`, `interrupted`, `unknown`, `unavailable`, and `timed_out`. Idle alone is not treated as success.

When available, results also include the assistant's `model` and a structured provider `error` with `type`, `message`, and HTTP `status`. Raw provider response bodies are omitted. For example, authentication failures return `provider.auth` and status `403`, rather than just an empty reply with outcome `failed`.

You can background the tool call through OpenCode's UI. It doesn't automatically background itself or send a completion message to another conversation. Other board tools continue working while it waits. Cancelling the tool cancels only the wait requests, not the sessions being watched.

For example, start a task with `board_start_session`, call `board_wait`, inspect `all_succeeded` and the replies, then explicitly call `board_move` if the work is ready for Review or Done.

## Connection failures

If Desktop is unavailable, open it and check that the plugin is enabled and the server is connected. A request that times out before delivery is removed from the queue.

If a timeout or cancellation says the request may have been applied, read the board before retrying. The bridge never automatically replays delivered writes, so a lost response cannot silently create a second task.
