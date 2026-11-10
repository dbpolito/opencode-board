import { Command, MenuItem, Panel, SettingsPage, Slot, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { BoardShortcut } from "./board-shortcut"
import { Kanban } from "./kanban"
import { sessionLauncher, sessionStarter } from "./start-session"
import { globalBoard } from "./kanban-storage"
import { connectBoardTools } from "./board-bridge"
import { BoardSettings, boardSettings, boardSettingsPage } from "./settings"
import { newTaskDialog } from "./new-task-dialog"
import css from "./kanban.css?inline"

export const setup: Plugin.Setup = (ctx) => {
  const board = globalBoard(ctx)
  const settings = boardSettings(ctx)
  const launch = sessionLauncher(ctx, board)
  connectBoardTools(ctx, board, launch, settings)
  const start = sessionStarter(ctx, board, launch)
  const createTask = newTaskDialog(ctx, board)
  const open = () => {
    const session = ctx.sessions.current()
    if (session) ctx.layout.open(`${ctx.id}:kanban`, session, { tab: "select" })
  }

  ctx.add(Style, css)
  ctx.add(SettingsPage, {
    id: boardSettingsPage, title: "Board", icon: "checklist",
    entries: [{ id: "tools", title: "Enable agent tools", keywords: "board tasks kanban tools agents" }],
    render: () => <BoardSettings settings={settings} />,
  })
  ctx.add(Command, (): Command => ({
    id: "kanban", title: "Board", keywords: "open tasks board project kanban global",
    featured: true, enabled: !!ctx.sessions.current(), slash: { name: "board" }, run: open,
  }))

  const tab: PanelTab = { id: "kanban", title: "Board", closable: "compact", fallback: true }
  ctx.add(Panel, {
    id: "kanban", region: "side", wide: true,
    list: (input) => input.open.includes("kanban") ? [tab] : [],
    render: (props) => <Kanban session={props.session} board={board} start={(task) => start(props.session, task)} openSettings={() => ctx.layout.settings(boardSettingsPage)} />,
  })
  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current()
    return {
      menu: "session.panel", id: "kanban", title: "Board", icon: "layout-right", keybind: `${ctx.id}.kanban`,
      opened: !!session && ctx.layout.state(`${ctx.id}:kanban`, session) !== "closed", run: open,
    }
  })
  ctx.add(Slot, {
    at: "session.header",
    render: (props) => <BoardShortcut session={props.session} board={board} createTask={(linked) => createTask(props.session, linked)} />,
  })
}
