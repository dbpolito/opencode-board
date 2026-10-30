import { taskLinks, taskLabels, moveCard, type Task, type TaskProject, type BoardSchema } from "./gui/kanban-model.ts"
import type { SessionModel } from "./session-model.ts"

export type Board = typeof BoardSchema.Type
export const toolSchemas = {
  list: { description: "List board columns and tasks in priority order. Optionally filter by search text, column ID, label, or project directory.", properties: { query: { type: "string" }, column_id: { type: "string" }, label: { type: "string" }, project_directory: { type: "string" } }, required: [] },
  get: { description: "Read a task's full Markdown description, project, and session links.", properties: { task_id: { type: "string" } }, required: ["task_id"] },
  create: { description: "Create a task. Defaults to the first column and no project. Does not start a session.", properties: { title: { type: "string", minLength: 1 }, description: { type: "string" }, labels: { type: "string", description: "Comma-separated labels" }, column_id: { type: "string" }, project: { type: ["object", "null"], properties: { server: { type: "string" }, directory: { type: "string" }, name: { type: "string" } }, required: ["server", "directory"], additionalProperties: false } }, required: ["title"] },
  update: { description: "Update only supplied task fields. To mark checklist progress, read the latest task with board_get, change each completed item's - [ ] to - [x], then send the full description preserving all other Markdown and unchecked items. Update after each item, not all at the end; never check unfinished work. Use expected_updated_at from board_get to avoid overwriting concurrent edits; re-read on conflict. Set project to null to unassign it. Use board_move for status or priority.", properties: { task_id: { type: "string" }, title: { type: "string", minLength: 1 }, description: { type: "string" }, labels: { type: "string" }, project: { type: ["object", "null"], properties: { server: { type: "string" }, directory: { type: "string" }, name: { type: "string" } }, required: ["server", "directory"], additionalProperties: false }, expected_updated_at: { type: "number", description: "Optional timestamp from board_get; reject if the task changed." } }, required: ["task_id"] },
  move: { description: "Move a task between columns or reorder it within its column. position is the zero-based final position: 0 is the top, 1 is second. Other tasks shift automatically. Omit column_id to keep its column; omit position to append. Positions past the end append.", properties: { task_id: { type: "string" }, column_id: { type: "string" }, position: { type: "integer", minimum: 0 } }, required: ["task_id"] },
  link_session: { description: "Link a conversation to a task, or unlink it with unlink=true. Defaults to the calling conversation. Supply session_id and server from board_get links to target another session. Never creates, stops, or deletes a session.", properties: { task_id: { type: "string" }, unlink: { type: "boolean" }, session_id: { type: "string", minLength: 1 }, server: { type: "string", minLength: 1 } }, required: ["task_id"] },
  start_session: { description: "Start work immediately from a task: create a session, link it, and send a concise instruction with its title, task_id, and Markdown description, asking the session to mark checkboxes as it completes them using board_update. Inherits the calling conversation's model/provider/variant. Uses the task's project/server, or the calling conversation's directory/server when unassigned. No tab is opened by default; set open=true to open a background tab. Does not move the task.", properties: { task_id: { type: "string" }, open: { type: "boolean", default: false, description: "Open the new session in a background tab. Defaults to false." } }, required: ["task_id"] },
  remove: { description: "Permanently remove a task and its session links from the board. Linked sessions remain intact and keep running. Never deletes or stops sessions.", properties: { task_id: { type: "string" } }, required: ["task_id"] },
  wait: { description: "Wait for a task's linked sessions to become idle and return their latest outcomes and replies. Optionally target a linked session_id/server. Excludes the calling conversation to avoid waiting on itself. Already-finished sessions return immediately. Does not move the task or open tabs. Can be backgrounded through OpenCode's UI.", properties: { task_id: { type: "string" }, session_id: { type: "string", minLength: 1 }, server: { type: "string", minLength: 1 }, timeout_seconds: { type: "integer", minimum: 1, maximum: 3600, default: 120 } }, required: ["task_id"] },
} as const
export type Operation = keyof typeof toolSchemas
export type BoardRequest = { operation: Operation; input: Record<string, unknown>; sessionID: string; directory?: string; model?: SessionModel }

export function taskResult(board: Board, task: Task, server: string) {
  return { ...task, links: taskLinks(task, server), position: board.cards.filter((card) => card.status === task.status).findIndex((card) => card.id === task.id) }
}

function text(input: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = input[key]
  if (value === undefined && !required) return
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`Invalid ${key}`)
  return value
}

function project(value: unknown): TaskProject | undefined {
  if (value === null || value === undefined) return
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid project")
  const item = value as Record<string, unknown>
  return { server: text(item, "server", true)!, directory: text(item, "directory", true)!, name: text(item, "name") }
}

// Called synchronously inside the same setup-owned store used by the board UI.
export function applyBoardRequest(board: Board, request: BoardRequest, server: string): { board: Board; result: unknown } {
  const { operation, input } = request
  const cards = board.cards.map((card) => ({ ...card }))
  let next: Board = { cards, columns: [...board.columns] }
  const column = (id: string) => {
    if (!board.columns.some((item) => item.id === id)) throw new Error(`Unknown column: ${id}`)
    return id
  }
  if (operation === "list") {
    const query = text(input, "query")?.trim().toLowerCase() ?? ""
    const status = text(input, "column_id")
    if (status !== undefined) column(status)
    const label = text(input, "label")
    const directory = text(input, "project_directory")
    const tasks = board.columns.flatMap((col) => cards.filter((card) => card.status === col.id)).filter((card) =>
      (!status || card.status === status) && (!label || taskLabels(card.labels).includes(label)) &&
      (directory === undefined || (directory === "" ? !card.project : card.project?.directory === directory)) &&
      `${card.title} ${card.description} ${card.labels}`.toLowerCase().includes(query))
    return { board, result: { columns: board.columns, tasks: tasks.map((task) => { const { description, ...summary } = taskResult(board, task, server); return summary }) } }
  }
  if (operation === "create") {
    const task: Task = { id: crypto.randomUUID(), title: text(input, "title", true)!.trim(), description: text(input, "description") ?? "", labels: text(input, "labels") ?? "", status: column(text(input, "column_id") ?? board.columns[0]?.id), session: "", links: [], project: project(input.project), updatedAt: Date.now() }
    cards.push(task)
    return { board: next, result: taskResult(next, task, server) }
  }
  const id = text(input, "task_id", true)!
  const task = cards.find((card) => card.id === id)
  if (!task) throw new Error(`Unknown task: ${id}`)
  if (operation === "get") return { board, result: taskResult(board, task, server) }
  if (operation === "remove") return { board: { ...next, cards: cards.filter((card) => card.id !== id) }, result: { task_id: id, removed: true } }
  if (operation === "update") {
    if (input.expected_updated_at !== undefined && (typeof input.expected_updated_at !== "number" || input.expected_updated_at !== (task.updatedAt ?? 0))) throw new Error("Task changed. Read it again before updating.")
    for (const key of ["title", "description", "labels"] as const) {
      if (input[key] === undefined) continue
      task[key] = text(input, key, key === "title")!
    }
    if (input.project !== undefined) {
      task.links = taskLinks(task, server)
      task.session = ""; task.sessions = []
      task.project = project(input.project)
    }
  } else if (operation === "move") {
    const status = column(text(input, "column_id") ?? task.status)
    const destination = cards.filter((card) => card.id !== id && card.status === status)
    const index = input.position ?? destination.length
    if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) throw new Error("position must be a non-negative integer")
    next = { ...next, cards: moveCard(cards, id, status, index) }
  } else if (operation === "link_session") {
    if (input.unlink !== undefined && typeof input.unlink !== "boolean") throw new Error("Invalid unlink")
    const sessionID = input.session_id === undefined ? request.sessionID : text(input, "session_id", true)!
    const targetServer = input.server === undefined ? server : text(input, "server", true)!
    const links = taskLinks(task, server).filter((link) => link.id !== sessionID || link.server !== targetServer)
    if (!input.unlink) links.push({ id: sessionID, server: targetServer })
    task.links = links; task.session = ""; task.sessions = []
  } else throw new Error("Unknown board operation")
  const updated = { ...next.cards.find((card) => card.id === id)!, updatedAt: Math.max(Date.now(), (task.updatedAt ?? 0) + 1) }
  next = { ...next, cards: next.cards.map((card) => card.id === id ? updated : card) }
  return { board: next, result: taskResult(next, updated, server) }
}
