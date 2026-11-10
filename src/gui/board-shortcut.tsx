import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { BoardStore } from "./kanban-storage"

export function BoardShortcut(props: { session: MountedSession; board: BoardStore; createTask(linked: boolean): void }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const count = () => props.board.ready() ? props.board.value?.cards.length : undefined
  const label = () => count() === undefined ? "Board" : `Board · ${count()} ${count() === 1 ? "card" : "cards"}`

  return <span class="sc-root sc-board-shortcut"><ui.Tooltip value={label()}>
    <ui.Menu trigger="button" icon="checklist" label={`${count() ?? "…"}`} items={[
      { label: "Open Board", icon: "checklist", onSelect: () => ctx.layout.open(`${ctx.id}:kanban`, props.session, { tab: "select" }) },
      { label: "New Task", icon: "plus", disabled: !props.board.ready() || !props.board.value?.columns.length, onSelect: () => props.createTask(false) },
      { label: "New Task from this Session", icon: "link", disabled: !props.board.ready() || !props.board.value?.columns.length, onSelect: () => props.createTask(true) },
    ]} />
  </ui.Tooltip></span>
}
