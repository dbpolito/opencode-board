import { usePlugin, type Context, type MountedSession } from "@opencode/plugin/gui"
import { Show, createSignal, onCleanup } from "solid-js"
import { TaskEditor, type DescriptionInput, type TaskFields } from "./task-editor"
import type { BoardStore } from "./kanban-storage"
import { currentTaskProject, openTaskProjects } from "./task-projects"
import type { Column, TaskProject } from "./kanban-model"

const summaryPrompt = "Summarize this conversation as a concise task description in Markdown. Preserve the goal, requirements, key decisions, relevant context, completed work, and remaining work. Omit handoff instructions and references to continuing the conversation. Return only the description."

function NewTaskDialog(props: { linked: boolean; sessionTitle: string; initialTitle: string; description?: DescriptionInput; status: string; columns: readonly Column[]; projects: readonly TaskProject[]; project: TaskProject; dispose(): void; cancel(): void; save(fields: TaskFields, linked?: boolean): void }) {
  const ui = usePlugin().ui
  const [linked, setLinked] = createSignal(props.linked)
  onCleanup(props.dispose)
  return <ui.Dialog title={props.linked ? "New Task from this Session" : "New Task"}>
    <div class="sc-root sc-kanban-ui">
      <TaskEditor initialTitle={props.initialTitle} description={props.description} columns={props.columns} projects={props.projects} project={props.project} status={props.status} cancel={props.cancel} save={(fields) => props.save(fields, linked())}>
        <div class="sc-editor-field">
          <ui.Switch label="Link current session" checked={linked()} onChange={setLinked} />
          <Show when={linked()}><div class="sc-linked-session"><ui.Icon name="link" size="small" /><span class="sc-linked-session-title">{props.sessionTitle}</span></div><small>Linked only when you save. No session is started.</small></Show>
          <Show when={props.linked}><small aria-live="polite">{props.description?.loading ? "Generating a description from this conversation…" : "Review and edit the description before saving."}</small></Show>
        </div>
      </TaskEditor>
    </div>
  </ui.Dialog>
}

export function newTaskDialog(ctx: Context, board: BoardStore) {
  return (session: MountedSession, linked = false) => {
    if (!board.ready() || !board.value?.columns.length) return
    const link = { server: session.server.id, id: session.id }
    const project = currentTaskProject(session)
    const projects = openTaskProjects(ctx, session)
    const title = ctx.servers.get(link.server)?.data.session.get(link.id)?.title ?? session.id
    const status = board.value.columns[0].id
    const controller = new AbortController()
    const [text, setText] = createSignal("")
    const [loading, setLoading] = createSignal(linked)
    const description: DescriptionInput = { get value() { return text() }, get loading() { return loading() }, onInput: setText }
    const dispose = () => controller.abort()
    let saved = false
    ctx.dialogs.open((dialog) => <NewTaskDialog linked={linked} sessionTitle={title} initialTitle={linked ? title : ""} description={linked ? description : undefined} status={status}
      columns={board.value?.columns ?? []} projects={projects} project={project} dispose={dispose} cancel={() => { dispose(); dialog.close() }}
      save={(fields, shouldLink = linked) => {
        if (controller.signal.aborted || loading() || saved || !fields.title.trim()) return
        board.update((draft) => {
          if (!draft.columns.some((column) => column.id === fields.status)) return
          draft.cards.push({ ...fields, id: crypto.randomUUID(), session: "", links: shouldLink ? [link] : [], updatedAt: Date.now() })
          saved = true
        })
        if (saved) { dispose(); dialog.close() }
        else ctx.toast.show({ variant: "error", title: "Could not create task", description: "The selected column no longer exists. Choose another column." })
      }} />)
    if (linked) void (async () => {
      try {
        const server = ctx.servers.get(link.server)
        if (!server?.connected) throw new Error("Server is disconnected")
        const result = await server.client.session.generate({ sessionID: link.id, prompt: summaryPrompt }, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (!result.text.trim()) throw new Error("No description was generated")
        setText(result.text.trim())
      } catch {
        if (!controller.signal.aborted) ctx.toast.show({ variant: "error", title: "Could not generate task description", description: "You can still write the description and save the task manually." })
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
  }
}
