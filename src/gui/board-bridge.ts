import { createEffect, onCleanup, untrack } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { BoardBridge } from "../rpc.ts"
import { applyBoardRequest, type BoardRequest } from "../board-tools.ts"
import type { BoardStore } from "./kanban-storage.ts"
import type { SessionLauncher } from "./start-session.ts"
import { waitForTask } from "./board-wait.ts"
import type { SettingsStore } from "./settings.tsx"

export function connectBoardTools(ctx: Context, board: BoardStore, launch: SessionLauncher, settings: SettingsStore) {
  const clientID = crypto.randomUUID()
  createEffect(() => {
    if (!board.ready() || !settings.ready()) return
    const servers = ctx.servers.list().map((id) => ctx.servers.get(id)).filter((server) => server?.connected)
    const controller = new AbortController()
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const waits = new Map<string, AbortController>()
    for (const server of servers) {
      if (!server) continue
      let lastFailure: string | undefined
      const poll = async () => {
        let stage = "poll"
        try {
          const rpc = server.client.rpc(BoardBridge)
          const delivery = await rpc.poll({ clientID, toolsEnabled: untrack(() => settings.value?.toolsEnabled ?? true) }, { signal: controller.signal }) as { id: string; request: BoardRequest } | { cancel: string } | null
          if (controller.signal.aborted) return
          if (delivery && "cancel" in delivery) waits.get(delivery.cancel)?.abort(new Error("Board wait cancelled"))
          else if (delivery) {
            const waitController = delivery.request.operation === "wait" ? new AbortController() : undefined
            const respond = async () => {
              let result: unknown
              let error: string | undefined
              try {
                if (!board.value) throw new Error("Board storage is not ready")
                if (settings.value?.toolsEnabled === false) throw new Error("OpenCode Board agent tools are disabled in Settings.")
                const request = delivery.request
                if (request.operation === "wait") {
                  const task = board.value.cards.find((card) => card.id === request.input.task_id)
                  if (!task) throw new Error(`Unknown task: ${request.input.task_id}`)
                  result = await waitForTask(ctx, task, request, server.id, waitController!.signal)
                } else if (request.operation === "start_session") {
                  if (request.input.open !== undefined && typeof request.input.open !== "boolean") throw new Error("Invalid open")
                  const task = board.value.cards.find((card) => card.id === request.input.task_id)
                  if (!task) throw new Error(`Unknown task: ${request.input.task_id}`)
                  if (!request.directory) throw new Error("The calling session's directory is unavailable")
                  if (!request.model?.id || !request.model.providerID) throw new Error("The calling session's model is unavailable")
                  result = await launch({ server: server.id, directory: request.directory, model: request.model }, task, { open: request.input.open === true, focus: false })
                } else {
                  const applied = applyBoardRequest(board.value, request, server.id)
                  if (applied.board !== board.value) board.set(applied.board)
                  result = applied.result
                }
              } catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
              stage = "complete"
              await rpc.complete({ clientID, id: delivery.id, ...(error === undefined ? { result: JSON.parse(JSON.stringify(result)) } : { error }) })
            }
            if (waitController) {
              waits.set(delivery.id, waitController)
              void respond().catch((error) => console.warn("Board wait response failed", { server: server.id, error: String(error) })).finally(() => waits.delete(delivery.id))
            } else await respond()
          }
          lastFailure = undefined
        } catch (cause) {
          // Server/plugin reloads and disconnected servers are retried, never replaying a delivered mutation.
          if (controller.signal.aborted) return
          const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause)
          const failure = `${stage}: ${message}`
          if (failure !== lastFailure) console.warn("Board tool bridge RPC failed", { server: server.id, stage, error: message })
          lastFailure = failure
        } finally {
          if (!controller.signal.aborted) {
            const timer = setTimeout(() => { timers.delete(timer); void poll() }, 500)
            timers.add(timer)
          }
        }
      }
      void poll()
    }
    onCleanup(() => { controller.abort(); timers.forEach(clearTimeout); waits.forEach((wait) => wait.abort(new Error("Desktop bridge disconnected"))) })
  })
}
