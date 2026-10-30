import type { Context, MountedSession } from "@opencode/plugin/gui"
import { taskPrompt, taskLinks, type Task } from "./kanban-model"
import type { BoardStore } from "./kanban-storage"
import { sessionOrigin, type SessionModel } from "../session-model.ts"

export function sessionLauncher(ctx: Context, board: BoardStore) {
  const creating = new Set<string>()

  return async (session: { server: string; directory: string; model: SessionModel }, task: Task, options: { open?: boolean; focus?: boolean } = {}) => {
    const serverID = task.project?.server ?? session.server
    const directory = task.project?.directory ?? session.directory
    const taskID = task.id
    const text = taskPrompt(task)
    const key = JSON.stringify([serverID, directory, taskID])
    if (creating.has(key)) throw new Error("A session is already being started for this task.")
    creating.add(key)
    try {
      const server = ctx.servers.get(serverID)
      if (!server?.connected) throw new Error("The workspace server is disconnected.")
      // The returned id is authoritative; no draft-tab discovery or prompt matching.
      const created = server.data.session.create({ title: task.title, location: { directory }, model: session.model })
      const info = await created.request
      let linked = false
      board.update((draft) => {
        const current = draft.cards.find((item) => item.id === taskID)
        if (!current) return
        current.links = [...taskLinks(current, serverID), { id: info.id, server: serverID }]
        current.session = ""
        current.sessions = []
        current.updatedAt = Date.now()
        linked = true
      })
      if (!linked) throw new Error("The task was deleted. The new session was not started.")
      if (options.open ?? true) ctx.tabs.open({ server: serverID, id: info.id }, { focus: options.focus ?? true })
      const live = ctx.servers.get(serverID)
      if (!live?.connected) throw new Error("The session was linked, but the server disconnected before the task could be sent.")
      await live.data.session.prompt({ sessionID: info.id, text })
      return { task_id: taskID, session_id: info.id, server: serverID, directory, model: session.model }
    } finally {
      creating.delete(key)
    }
  }
}

export type SessionLauncher = ReturnType<typeof sessionLauncher>

export function sessionStarter(ctx: Context, board: BoardStore, launch = sessionLauncher(ctx, board)) {
  return async (session: MountedSession, task: Task) => {
    try {
      const source = ctx.servers.get(session.server.id)
      if (!source?.connected) throw new Error("The launching session's server is disconnected.")
      const origin = await sessionOrigin(source.client.session, session.id)
      await launch({ server: session.server.id, ...origin }, task)
    } catch (error) {
      ctx.toast.show({ title: "Could not start session", description: error instanceof Error ? error.message : String(error), variant: "error" })
    }
  }
}
