import { Plugin } from "@opencode/plugin"
import { BoardBridge } from "./rpc.ts"
import { bridgeQueue } from "./bridge-queue.ts"
import { toolSchemas } from "./board-tools.ts"
import { sessionOrigin } from "./session-model.ts"
import { toolSettings } from "./tool-settings.ts"

// Location instances in the same server share a broker, not per-project boards.
const key = Symbol.for("opencode-board.bridge.v2")
const shared = globalThis as typeof globalThis & { [key]?: ReturnType<typeof bridgeQueue> }
const queue = shared[key] ??= bridgeQueue()
const settingsKey = Symbol.for("opencode-board.tool-settings.v1")
const preferences = globalThis as typeof globalThis & { [settingsKey]?: ReturnType<typeof toolSettings> }
const settings = preferences[settingsKey] ??= toolSettings()

export default Plugin.define({
  id: "opencode-board",
  async setup(ctx) {
    await settings.load(ctx.storage)
    await ctx.rpc.register(BoardBridge, {
      poll: async (input) => {
        const { clientID, toolsEnabled } = input as { clientID: string; toolsEnabled?: boolean }
        if (toolsEnabled !== undefined) await settings.set(toolsEnabled, ctx.storage)
        return queue.poll(clientID)
      },
      complete: async (input) => {
        const { clientID, id, result, error } = input as { clientID: string; id: string; result?: unknown; error?: string }
        queue.complete(clientID, id, result, error)
        return null
      },
    })
    await ctx.tool.transform((editor) => {
      if (!settings.enabled) return
      for (const [operation, definition] of Object.entries(toolSchemas)) {
        editor.add({
          name: `board_${operation}`,
          description: `${definition.description} Requires OpenCode Desktop open and connected.`,
          input: { type: "object", properties: definition.properties, required: [...definition.required], additionalProperties: false },
          execute: async (input, context) => {
            if (!settings.enabled) throw new Error("OpenCode Board agent tools are disabled in Settings.")
            if (operation !== "list" && operation !== "get" && operation !== "wait") {
              await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, source: { type: "tool", messageID: context.messageID, id: context.id }, action: operation === "start_session" ? "board_start_session" : operation === "remove" ? "board_remove" : "board_update", resources: [String((input as Record<string, unknown>).task_id ?? "new")], save: ["*"] })
            }
            const origin = operation === "start_session" ? await sessionOrigin(ctx.session, context.sessionID) : undefined
            const timeout = (input as Record<string, unknown>).timeout_seconds ?? 120
            if (operation === "wait" && (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1 || timeout > 3600)) throw new Error("timeout_seconds must be an integer between 1 and 3600")
            if (!settings.enabled) throw new Error("OpenCode Board agent tools are disabled in Settings.")
            const result = await queue.request({ operation, input, sessionID: context.sessionID, ...(origin ?? {}) }, context.signal, operation === "wait" ? { concurrent: true, timeout: Number(timeout) * 1000 + 15_000 } : {})
            return { content: JSON.stringify(result) }
          },
        })
      }
    })
    return settings.subscribe(() => ctx.tool.reload())
  },
})
