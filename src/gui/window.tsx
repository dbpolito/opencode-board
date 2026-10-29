import { Command, MenuItem, Panel, Slot, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { BoardShortcut } from "./board-shortcut"
import { Kanban } from "./kanban"
import { sessionStarter } from "./start-session"
import { globalBoard } from "./kanban-storage"
import css from "./kanban.css?inline"

export const setup: Plugin.Setup = (ctx) => {
  const board = globalBoard(ctx)
  const start = sessionStarter(ctx, board)
  const open = () => {
    const session = ctx.sessions.current()
    if (session) ctx.layout.open(`${ctx.id}:kanban`, session, { tab: "select" })
  }

  ctx.add(Style, css)
  ctx.add(Command, (): Command => ({
    id: "kanban", title: "Kanban: Open task board", keywords: "tasks board project kanban global",
    featured: true, enabled: !!ctx.sessions.current(), slash: { name: "kanban" }, run: open,
  }))

  const tab: PanelTab = { id: "kanban", title: "Task board", closable: "compact", fallback: true }
  ctx.add(Panel, {
    id: "kanban", region: "side", wide: true,
    list: (input) => input.open.includes("kanban") ? [tab] : [],
    render: (props) => <Kanban session={props.session} board={board} start={(task) => start(props.session, task)} />,
  })
  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current()
    return {
      menu: "session.panel", id: "kanban", title: "Task board", icon: "layout-right", keybind: `${ctx.id}.kanban`,
      opened: !!session && ctx.layout.state(`${ctx.id}:kanban`, session) !== "closed", run: open,
    }
  })
  ctx.add(Slot, {
    at: "session.header",
    render: (props) => <BoardShortcut session={props.session} board={board} />,
  })
}
