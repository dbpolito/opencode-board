import type { Context } from "@opencode/plugin/gui"
import { taskLinks, type Task } from "./kanban-model.ts"
import type { BoardRequest } from "../board-tools.ts"

function message(error: unknown): string {
  return error && typeof error === "object" && "message" in error ? String(error.message) : String(error)
}

export async function waitForTask(ctx: Pick<Context, "servers">, task: Task, request: BoardRequest, callingServer: string, signal: AbortSignal) {
  const input = request.input
  const seconds = input.timeout_seconds ?? 120
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error("timeout_seconds must be an integer between 1 and 3600")
  for (const key of ["session_id", "server"] as const) if (input[key] !== undefined && (typeof input[key] !== "string" || !input[key].trim())) throw new Error(`Invalid ${key}`)
  if (input.server !== undefined && input.session_id === undefined) throw new Error("server requires session_id")
  const links = taskLinks(task, callingServer).filter((link) => input.session_id === undefined || (link.id === input.session_id && link.server === (input.server ?? callingServer)))
  const targets = links.filter((link) => link.id !== request.sessionID || link.server !== callingServer)
  if (!targets.length) throw new Error("No linked sessions to wait for (the calling conversation is excluded).")
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error("Wait timed out")) }, seconds * 1000)
  try {
    const sessions = await Promise.all(targets.map(async (link) => {
      try {
        controller.signal.throwIfAborted()
        const server = ctx.servers.get(link.server)
        if (!server?.connected) throw new Error("Server is disconnected")
        // Native wait is event-driven and immediately resolves for idle sessions.
        await server.client.session.wait({ sessionID: link.id }, { signal: controller.signal })
        const messages = await server.client.session.context({ sessionID: link.id }, { signal: controller.signal })
        const last = messages.at(-1)
        const reply = messages.findLast((item) => item.type === "assistant")
        const error = last?.type === "idle" && last.outcome !== "succeeded" ? last.error ?? (reply?.type === "assistant" ? reply.error : undefined) : undefined
        return {
          ...link,
          outcome: last?.type === "idle" ? last.outcome : "unknown",
          text: reply?.type === "assistant" ? reply.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : "",
          ...(reply?.type === "assistant" && reply.model ? { model: reply.model } : {}),
          // Return actionable diagnostics without leaking raw provider response bodies.
          ...(error ? { error: { type: error.type, message: error.message, ...(error.status === undefined ? {} : { status: error.status }) } } : {}),
        }
      } catch (error) {
        return { ...link, outcome: controller.signal.aborted ? timedOut ? "timed_out" : "cancelled" : "unavailable", error: message(error) }
      }
    }))
    signal.throwIfAborted()
    return { task_id: task.id, timed_out: timedOut, all_succeeded: sessions.every((session) => session.outcome === "succeeded"), sessions }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", abort)
    controller.abort()
  }
}
