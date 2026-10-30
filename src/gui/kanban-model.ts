import { Schema } from "effect"

export const columns = [
  { id: "backlog", title: "Backlog", color: "var(--v2-icon-icon-muted)" },
  { id: "ready", title: "Ready", color: "var(--v2-state-fg-info)" },
  { id: "progress", title: "In progress", color: "var(--v2-state-fg-warning)" },
  { id: "review", title: "Review", color: "var(--v2-text-text-accent)" },
  { id: "done", title: "Done", color: "var(--v2-state-fg-success)" },
] as const

export const TaskProjectSchema = Schema.Struct({ server: Schema.String, directory: Schema.String, name: Schema.optional(Schema.String) })
export type TaskProject = typeof TaskProjectSchema.Type
export const SessionLinkSchema = Schema.Struct({ server: Schema.String, id: Schema.String })
export type SessionLink = typeof SessionLinkSchema.Type

export const CardSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  labels: Schema.String,
  status: Schema.String,
  session: Schema.String,
  sessions: Schema.optional(Schema.Array(Schema.String)),
  links: Schema.optional(Schema.Array(SessionLinkSchema)),
  project: Schema.optional(TaskProjectSchema),
  updatedAt: Schema.optional(Schema.Number),
})
export const ColumnSchema = Schema.Struct({ id: Schema.String, title: Schema.String, color: Schema.String })
export type Column = typeof ColumnSchema.Type
export const BoardSchema = Schema.Struct({ cards: Schema.Array(CardSchema), columns: Schema.Array(ColumnSchema) })
export type Task = typeof CardSchema.Type
export type Status = Task["status"]
export function taskSessions(task: Pick<Task, "session" | "sessions">): string[] {
  return [...new Set([task.session, ...(task.sessions ?? [])].filter(Boolean))]
}

export function taskLinks(task: Pick<Task, "session" | "sessions" | "links" | "project">, fallbackServer: string): SessionLink[] {
  const links = [...(task.links ?? []), ...taskSessions(task).map((id) => ({ id, server: task.project?.server ?? fallbackServer }))]
  return links.filter((link, index) => links.findIndex((item) => item.id === link.id && item.server === link.server) === index)
}

export function projectKey(project: TaskProject): string {
  return JSON.stringify([project.server, project.directory])
}

export function projectTitle(project: TaskProject): string {
  return project.name?.trim() || project.directory.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || project.directory
}

export function taskIsRunning(task: Pick<Task, "session" | "sessions" | "links" | "project">, status: (id: string, server: string) => "idle" | "running" | undefined, connected: boolean, fallbackServer = ""): boolean {
  return connected && taskLinks(task, fallbackServer).some((link) => status(link.id, link.server) === "running")
}
export function initialBoard(): typeof BoardSchema.Type {
  return { cards: [], columns: columns.map((column) => ({ ...column })) }
}

export function placeColumn(items: readonly Column[], id: string, index: number): Column[] {
  const source = items.find((item) => item.id === id)
  if (!source) return [...items]
  const next = items.filter((item) => item.id !== id)
  next.splice(Math.max(0, Math.min(next.length, index)), 0, source)
  return next
}

export function deleteColumn(board: typeof BoardSchema.Type, id: string, destination?: string): typeof BoardSchema.Type {
  if (!board.columns.some((column) => column.id === id) || board.columns.length <= 1) return board
  const hasTasks = board.cards.some((card) => card.status === id)
  if (hasTasks && (!destination || destination === id || !board.columns.some((column) => column.id === destination))) return board
  return { columns: board.columns.filter((column) => column.id !== id), cards: board.cards.map((card) => card.status === id ? { ...card, status: destination! } : card) }
}
export const BoardViewSchema = Schema.Struct({
  collapsed: Schema.Array(Schema.String),
  mode: Schema.Literals(["overlay", "split", "full"]),
  splitWidth: Schema.optional(Schema.Number),
  overlayWidth: Schema.optional(Schema.Number),
})
export type DetailMode = typeof BoardViewSchema.Type.mode

export function detailWidthBounds(available: number, mode: DetailMode): { min: number; max: number } {
  const max = Math.max(0, available - (mode === "split" ? 232 : mode === "overlay" ? 24 : 0))
  return { min: Math.min(280, max), max }
}

export function clampDetailWidth(width: number, available: number, mode: DetailMode): number {
  const { min, max } = detailWidthBounds(available, mode)
  return Math.round(Math.max(min, Math.min(max, Number.isFinite(width) ? width : 380)))
}

export function taskLabels(text: string): string[] {
  return [...new Set(text.split(",").map((label) => label.trim()).filter(Boolean))]
}

export function matchesTask(task: Task, query: string, label: string, project = ""): boolean {
  return (!label || taskLabels(task.labels).includes(label)) &&
    (!project || (task.project ? projectKey(task.project) : "none") === project) &&
    `${task.title} ${task.description} ${task.labels}`.toLowerCase().includes(query.trim().toLowerCase())
}

export function moveCard<T extends Task>(cards: readonly T[], id: string, status: Status, index?: number): T[] {
  const card = cards.find((item) => item.id === id)
  if (!card || (card.status === status && index === undefined)) return [...cards]
  const remaining = cards.filter((item) => item.id !== id)
  const destination = remaining.filter((item) => item.status === status)
  const anchor = index === undefined ? undefined : destination[Math.max(0, index)]
  const position = anchor ? remaining.findIndex((item) => item.id === anchor.id) : remaining.length
  remaining.splice(position, 0, { ...card, status })
  return remaining
}

export function taskPrompt(card: Task): string {
  return [`Work on board task "${card.title}" (task_id: ${card.id}). Mark checkboxes as you complete.`, card.description].filter(Boolean).join("\n\n")
}
