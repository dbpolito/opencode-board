import type { Context } from "@opencode/plugin/gui"
import { BoardSchema, initialBoard } from "./kanban-model.ts"

export function globalBoard(ctx: Pick<Context, "storage">) {
  return ctx.storage.store("kanban-v2", {
    schema: BoardSchema, initial: initialBoard(),
    scope: "global",
    from: "plugin.opencode-desktop-showcase.kanban-v2",
  })
}
export type BoardStore = ReturnType<typeof globalBoard>
