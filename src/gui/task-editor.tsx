import { Show, createSignal, type JSX } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { projectTitle, type Column, type Status, type Task, type TaskProject } from "./kanban-model"

export type TaskFields = Pick<Task, "title" | "description" | "labels" | "status" | "project">
export type DescriptionInput = { readonly value: string; readonly loading: boolean; onInput(value: string): void }

export function TaskEditor(props: { existing?: Task; initialTitle?: string; description?: DescriptionInput; columns: readonly Column[]; projects: readonly TaskProject[]; project?: TaskProject; status: Status; children?: JSX.Element; cancel(): void; save(fields: TaskFields): void }) {
  const ui = usePlugin().ui
  const [title, setTitle] = createSignal(props.existing?.title ?? props.initialTitle ?? "")
  const [localDescription, setDescription] = createSignal(props.existing?.description ?? "")
  const description = () => props.description?.value ?? localDescription()
  const generating = () => props.description?.loading ?? false
  const [labels, setLabels] = createSignal(props.existing?.labels ?? "")
  const [status, setStatus] = createSignal(props.existing?.status ?? props.status)
  const [project, setProject] = createSignal<TaskProject | undefined>(props.existing ? props.existing.project : props.project)
  const [preview, setPreview] = createSignal(false)
  return <form class="sc-task-editor" onSubmit={(event) => {
    event.preventDefault()
    if (title().trim() && !generating()) props.save({ title: title().trim(), description: description().trim(), labels: labels().trim(), status: status(), project: project() })
  }}>
    <div class="sc-editor-field"><span>Title</span><ui.TextInput class="sc-kanban-input" label="Title" value={title()} onInput={setTitle} placeholder="What needs to be done?" autofocus /></div>
    <div class="sc-editor-field"><span>Status</span><ui.Menu label={props.columns.find((column) => column.id === status())?.title ?? "Choose column"} trigger="button" items={props.columns.map((column) => ({ label: column.title, onSelect: () => setStatus(column.id) }))} /></div>
    <div class="sc-editor-field"><span>Project</span><ui.Menu label={project() ? projectTitle(project()!) : "No project"} trigger="button" items={[
      { label: "No project", onSelect: () => setProject(undefined) },
      ...props.projects.map((item) => ({ label: projectTitle(item), onSelect: () => setProject(item) })),
    ]} /></div>
    <div class="sc-editor-field"><div class="sc-description-heading"><span>Description</span><div class="sc-actions"><ui.Button size="small" disabled={generating()} variant={preview() ? "ghost-muted" : "neutral"} onClick={() => setPreview(false)}>Write</ui.Button><ui.Button size="small" disabled={generating()} variant={preview() ? "neutral" : "ghost-muted"} onClick={() => setPreview(true)}>Preview</ui.Button></div></div>
      <Show when={preview() && !generating()} fallback={<textarea aria-label="Description" aria-busy={generating()} disabled={generating()} value={description()} onInput={(event) => props.description ? props.description.onInput(event.currentTarget.value) : setDescription(event.currentTarget.value)} placeholder={generating() ? "Generating…" : "Context, acceptance criteria… Markdown and - [ ] checklists supported."} />}><div class="sc-markdown-preview"><Show when={description()} fallback={<p>Nothing to preview yet.</p>}><ui.Markdown text={description()} /></Show></div></Show>
    </div>
    <div class="sc-editor-field"><span>Labels</span><ui.TextInput class="sc-kanban-input" label="Labels" value={labels()} onInput={setLabels} placeholder="ui, bug, priority" /></div>
    {props.children}
    <div class="sc-editor-actions"><ui.Button type="button" onClick={props.cancel}>Cancel</ui.Button><ui.Button type="submit" variant="contrast" disabled={generating() || !title().trim() || !props.columns.some((column) => column.id === status())}>Save task</ui.Button></div>
  </form>
}
