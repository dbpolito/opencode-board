import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { BoardStore } from "./kanban-storage"

export function BoardShortcut(props: { session: MountedSession; board: BoardStore }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const count = () => props.board.ready() ? props.board.value?.cards.length : undefined
  const label = () => count() === undefined ? "Open task board" : `Open task board · ${count()} ${count() === 1 ? "card" : "cards"}`

  return <span class="sc-root sc-board-shortcut"><ui.Tooltip value={label()}>
    <ui.Button size="small" variant="ghost-muted" aria-label={label()}
      onClick={() => ctx.layout.open(`${ctx.id}:kanban`, props.session, { tab: "select" })}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
        <path d="M6 2.5v11M10 2.5v11M3.5 5h.5M3.5 7h.5M8 5h.5M12 5h.5M12 7h.5M12 9h.5" />
      </svg>
      <span class="sc-board-count">{count() ?? "…"}</span>
    </ui.Button>
  </ui.Tooltip></span>
}
