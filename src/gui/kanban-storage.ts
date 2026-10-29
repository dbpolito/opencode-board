import type { Context } from "@opencode/plugin/gui"
import { createEffect, createMemo } from "solid-js"
import { BoardSchema, initialBoard, projectKey, taskLinks, type TaskProject } from "./kanban-model.ts"
import { currentTaskProject } from "./task-projects.ts"

export function globalBoard(ctx: Pick<Context, "storage">) {
  return ctx.storage.store("kanban-v2", {
    schema: BoardSchema, initial: initialBoard(),
    scope: "global",
  })
}

export function importProjectBoard(board: typeof BoardSchema.Type, source: typeof BoardSchema.Type, project: TaskProject, key = projectKey(project)): typeof BoardSchema.Type {
  if (board.imports?.includes(key)) return board
  const columns = [...board.columns]
  const mapping = new Map<string, string>()
  for (const column of source.columns) {
    const existing = columns.find((item) => item.id === column.id)
    const id = existing && (existing.title !== column.title || existing.color !== column.color) ? `${key}:${column.id}` : column.id
    if (!columns.some((item) => item.id === id)) columns.push({ ...column, id })
    mapping.set(column.id, id)
  }
  const cards = source.cards.map((task) => ({
    ...task, id: `${key}:${task.id}`, project, status: mapping.get(task.status) ?? columns[0].id,
    session: "", sessions: [], links: taskLinks(task, project.server),
  }))
  return { columns, cards: [...board.cards, ...cards], imports: [...(board.imports ?? []), key] }
}

// Import each former workspace once, so later deletions never resurrect its tasks.
export function importWorkspaceBoards(ctx: Context) {
  const board = globalBoard(ctx)
  const source = createMemo(() => {
    const session = ctx.sessions.current()
    if (!session) return
    const scope = { server: session.server.id, directory: session.directory }
    const project = currentTaskProject(session)
    return { project, key: projectKey(scope), store: ctx.storage.store("kanban-v2", { schema: BoardSchema, initial: initialBoard(), scope }) }
  })
  createEffect(() => {
    const current = source()
    if (!current || !board.ready() || !current.store.ready() || board.value?.imports?.includes(current.key)) return
    const value = current.store.value
    if (!value) return
    board.update((draft) => {
      const next = importProjectBoard(draft, value, current.project, current.key)
      draft.columns = next.columns.map((column) => ({ ...column }))
      draft.cards = next.cards.map((task) => ({ ...task, sessions: task.sessions ? [...task.sessions] : undefined, links: task.links?.map((link) => ({ ...link })) }))
      draft.imports = [...(next.imports ?? [])]
    })
  })
}
