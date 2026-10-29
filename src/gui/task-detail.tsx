import { For, Show, createSignal, onMount } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { projectTitle, taskLabels, taskLinks, type Column, type Status, type Task, type SessionLink } from "./kanban-model"
import { TaskMarkdown } from "./task-markdown-view"

export function TaskDetail(props: {
  task: Task; session: MountedSession; columns: readonly Column[]
  close(): void; edit(): void; remove(): void; move(status: Status): void; start(): Promise<void>
  update(fields: Partial<Pick<Task, "description" | "session" | "sessions" | "links">>): void
}) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [starting, setStarting] = createSignal(false)
  const linked = () => taskLinks(props.task, props.session.server.id)
  const linkedTitle = (link: SessionLink) => ctx.servers.get(link.server)?.data.session.list()
    .find((session) => session.id === link.id)?.title || `Session ${link.id}`
  const setLinks = (links: SessionLink[]) => props.update({ session: "", sessions: [], links })
  const currentLinked = () => linked().some((link) => link.id === props.session.id && link.server === props.session.server.id)
  let element: HTMLElement | undefined
  onMount(() => element?.focus())
  return <aside ref={element} tabIndex={-1} class="sc-task-detail" aria-label={`Task details: ${props.task.title}`} onKeyDown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); props.close() }
  }}>
    <header class="sc-detail-toolbar"><span>Task details</span><div class="sc-actions">
      <ui.Tooltip value="Close task"><ui.IconButton icon="close" label="Close task" variant="ghost" onClick={props.close} /></ui.Tooltip>
    </div></header>
    <div class="sc-detail-body">
      <div class="sc-detail-title"><h2>{props.task.title}</h2><div class="sc-actions"><ui.Tooltip value="Edit task"><ui.IconButton icon="edit" label="Edit task" variant="ghost" onClick={props.edit} /></ui.Tooltip><ui.Tooltip value="Delete task"><ui.IconButton icon="trash" label="Delete task" variant="ghost" onClick={props.remove} /></ui.Tooltip></div></div>
      <div class="sc-detail-meta"><ui.Menu label={props.columns.find((column) => column.id === props.task.status)?.title ?? "Choose column"} trigger="button" items={props.columns.map((column) => ({ label: column.title, disabled: column.id === props.task.status, onSelect: () => props.move(column.id) }))} />
        <div class="sc-task-labels"><For each={taskLabels(props.task.labels)}>{(label) => <span>{label}</span>}</For></div>
      </div>
      <p title={props.task.project?.directory}>{props.task.project ? `Project: ${projectTitle(props.task.project)}` : "No project · new sessions use the currently open project"}</p>
      <Show when={props.task.updatedAt}><p>Updated {new Date(props.task.updatedAt!).toLocaleString()}</p></Show>
      <section class="sc-detail-section"><h3>Description</h3><Show when={props.task.description} fallback={<p>No description yet. Edit the task to add context.</p>}><TaskMarkdown text={props.task.description} update={(description) => props.update({ description })} /></Show></section>
      <section class="sc-detail-section"><h3>Linked sessions</h3><p>Start a new session with this task, or link the current session. Task status stays manual.</p>
        <For each={linked()}>{(link) => <div class="sc-linked-session">
          <ui.Tooltip value={`Open session: ${linkedTitle(link)}`}><ui.Button size="small" icon="arrow-up-right" aria-label={`Open session: ${linkedTitle(link)}`} onClick={() => ctx.tabs.open(link, { focus: true })}><span class="sc-linked-session-title">{linkedTitle(link)}</span></ui.Button></ui.Tooltip>
          <ui.Tooltip value="Unlink session from task"><ui.IconButton icon="close" label={`Unlink ${linkedTitle(link)} from task`} size="small" variant="ghost" onClick={() => setLinks(linked().filter((item) => item.id !== link.id || item.server !== link.server))} /></ui.Tooltip>
        </div>}</For>
        <div class="sc-actions"><ui.Button size="small" icon="new-session" busy={starting()} onClick={async () => {
          setStarting(true)
          try { await props.start() } finally { setStarting(false) }
        }}>Start session</ui.Button>
          <ui.Button size="small" icon="link" disabled={currentLinked()} onClick={() => { if (!currentLinked()) setLinks([...linked(), { id: props.session.id, server: props.session.server.id }]) }}>Link current session</ui.Button>
        </div>
      </section>
    </div>
  </aside>
}
