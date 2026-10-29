import type { Context, MountedSession } from "@opencode/plugin/gui"
import { taskPrompt, taskLinks, type Task } from "./kanban-model"
import { globalBoard } from "./kanban-storage"

export function sessionStarter(ctx: Context) {
  const creating = new Set<string>()

  return async (session: MountedSession, task: Task) => {
    const serverID = task.project?.server ?? session.server.id
    const directory = task.project?.directory ?? session.directory
    const taskID = task.id
    const text = taskPrompt(task)
    const key = JSON.stringify([serverID, directory, taskID])
    if (creating.has(key)) return
    creating.add(key)
    try {
      const board = globalBoard(ctx)
      const server = ctx.servers.get(serverID)
      if (!server?.connected) throw new Error("The workspace server is disconnected.")
      // The returned id is authoritative; no draft-tab discovery or prompt matching.
      const created = server.data.session.create({ title: task.title, location: { directory } })
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
      ctx.tabs.open({ server: serverID, id: info.id }, { focus: true })
      const live = ctx.servers.get(serverID)
      if (!live?.connected) throw new Error("The session was linked, but the server disconnected before the task could be sent.")
      await live.data.session.prompt({ sessionID: info.id, text })
    } catch (error) {
      ctx.toast.show({ title: "Could not start session", description: error instanceof Error ? error.message : String(error), variant: "error" })
    } finally {
      creating.delete(key)
    }
  }
}
