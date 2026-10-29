import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { DragDropProvider, DragOverlay, PointerSensor, useDroppable, type DragDropProviderProps } from "@dnd-kit/solid"
import { PointerActivationConstraints } from "@dnd-kit/dom"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { BoardViewSchema, deleteColumn, matchesTask, moveCard, placeColumn, projectKey, projectTitle, taskIsRunning, taskLabels, taskLinks, type Column, type Status, type Task, type TaskProject } from "./kanban-model"
import { checklistItems, markdownExcerpt } from "./task-markdown"
import { TaskDetail } from "./task-detail"
import { ResizableDetail } from "./resizable-detail"
import type { BoardStore } from "./kanban-storage"
import { currentTaskProject, openTaskProjects } from "./task-projects"

export function Kanban(props: { session: MountedSession; board: BoardStore; start(task: Task): Promise<void> }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  const board = () => props.board
  const cards = () => board().value?.cards ?? []
  const running = (task: Task) => {
    return taskIsRunning(task, (id, serverID) => {
      const server = ctx.servers.get(serverID)
      return server?.connected ? server.data.session.status(id) : undefined
    }, true, props.session.server.id)
  }
  const columns = () => board().value?.columns ?? []
  const view = createMemo(() => ctx.storage.store("kanban-view-v2", {
    schema: BoardViewSchema, initial: { collapsed: [], mode: "overlay" },
    scope: "global",
  }))
  const [selected, setSelected] = createSignal<{ id: string; scope: ReturnType<typeof board> }>()
  const selectedTask = () => selected()?.scope === board() ? cards().find((card) => card.id === selected()?.id) : undefined
  const [editor, setEditor] = createSignal<{ existing?: Task; status: Status; scope: ReturnType<typeof board> }>()
  const editing = () => editor()?.scope === board() ? editor() : undefined
  const detailOpen = () => !!editing() || !!selectedTask()
  const closeDetail = () => { setEditor(undefined); setSelected(undefined) }
  const [label, setLabel] = createSignal("")
  const [projectFilter, setProjectFilter] = createSignal("")
  const currentProject = () => currentTaskProject(props.session)
  const projects = createMemo(() => openTaskProjects(ctx, props.session))
  createEffect(() => {
    const selected = projectFilter()
    if (selected && selected !== "none" && !projects().some((project) => projectKey(project) === selected)) setProjectFilter("")
  })
  const labels = () => [...new Set(cards().flatMap((card) => taskLabels(card.labels)))].sort()
  const filtered = () => !!filter().trim() || !!label() || !!projectFilter()
  const collapsed = (status: Status) => !!view().value?.collapsed.includes(status) && landing()?.status !== status
  const toggleColumn = (status: Status) => view().update((draft) => {
    draft.collapsed = draft.collapsed.includes(status) ? draft.collapsed.filter((item) => item !== status) : [...draft.collapsed, status]
  })
  const [dragging, setDragging] = createSignal<string>()
  const [draggingColumn, setDraggingColumn] = createSignal<string>()
  const [columnIndex, setColumnIndex] = createSignal<number>()
  const displayColumns = createMemo(() => {
    const id = draggingColumn()
    const index = columnIndex()
    return id && index !== undefined ? placeColumn(columns(), id, index) : columns()
  })
  const [dragHeight, setDragHeight] = createSignal(100)
  const [dragTop, setDragTop] = createSignal(0)
  const [landing, setLanding] = createSignal<{ status: Status; anchor?: string; after: boolean }>()
  const [filter, setFilter] = createSignal("")
  const [boardBottom, setBoardBottom] = createSignal(8)
  const observeBoardHeight = (element: HTMLDivElement) => {
    const measure = () => setBoardBottom(element.offsetHeight - element.clientHeight + (parseFloat(getComputedStyle(element).paddingBottom) || 0))
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  }
  let root: HTMLDivElement | undefined
  let dragBoard: ReturnType<typeof board> | undefined
  let suppressClickUntil = 0
  const preview = (operation: Parameters<NonNullable<DragDropProviderProps["onDragOver"]>>[0]["operation"], point = operation.position.current) => {
    const { source, target } = operation
    if (source?.type === "column") {
      const container = root?.querySelector<HTMLElement>(".sc-board-columns")
      const bounds = container?.getBoundingClientRect()
      if (!container || !bounds || point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return setColumnIndex(undefined)
      const elements = [...container.querySelectorAll<HTMLElement>("[data-kanban-column]")]
      const slot = elements.find((element) => element.dataset.kanbanColumn === source.data.columnID)
      const tolerance = Math.min(24, (slot?.getBoundingClientRect().width ?? 240) / 4)
      const others = elements.filter((element) => element !== slot)
      const index = others.findIndex((element) => {
        const rect = element.getBoundingClientRect()
        const offset = slot ? slot.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING ? -tolerance : tolerance : 0
        return point.x < rect.left + rect.width / 2 + offset
      })
      setColumnIndex(index < 0 ? others.length : index)
      return
    }
    if (source && operation.activatorEvent?.type !== "keydown") {
      const element = [...root?.querySelectorAll<HTMLElement>("[data-kanban-column]") ?? []].find((element) => {
        const rect = element.getBoundingClientRect()
        return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
      })
      const status = columns().find((column) => column.id === element?.dataset.kanbanColumn)?.id
      if (!element || !status) return setLanding(undefined)
      const slot = element.querySelector(".sc-drop-slot")
      const tolerance = Math.min(24, dragHeight() / 4)
      const anchor = [...element.querySelectorAll<HTMLElement>("[data-task-id]")].find((card) => {
        if (card.dataset.taskId === String(source.id)) return false
        const rect = card.getBoundingClientRect()
        const offset = slot ? slot.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING ? -tolerance : tolerance : 0
        return point.y < rect.top + rect.height / 2 + offset
      })
      return setLanding({ status, anchor: anchor?.dataset.taskId, after: false })
    }
    if (source && target && source.id === target.id) return
    if (!source || !target) return setLanding(undefined)
    const status = columns().find((column) => column.id === (isSortable(target) ? target.group : target.data.status))?.id
    if (!status) return setLanding(undefined)
    const card = cards().find((item) => item.id === target.id)
    const rect = target.element?.getBoundingClientRect()
    const keyboard = operation.activatorEvent?.type === "keydown"
    const after = card && rect ? keyboard
      ? isSortable(source) && isSortable(target) && source.group === target.group && source.index < target.index
      : operation.position.current.y > rect.top + rect.height / 2 : false
    setLanding({ status, anchor: card?.id, after: !!after })
  }
  const finish: NonNullable<DragDropProviderProps["onDragEnd"]> = (event) => {
    preview(event.operation)
    if (draggingColumn()) {
      const id = draggingColumn()!
      const index = columnIndex()
      if (!event.canceled && dragBoard === board() && index !== undefined) board().update((draft) => { draft.columns = placeColumn(draft.columns, id, index) })
      setDraggingColumn(undefined); setColumnIndex(undefined)
      dragBoard = undefined; suppressClickUntil = Date.now() + 200
      return
    }
    const destination = landing()
    const id = dragging()
    if (!event.canceled && event.operation.target && dragBoard === board() && destination && id) {
      board().update((draft) => {
        if (!draft.columns.some((column) => column.id === destination.status)) return
        const others = draft.cards.filter((item) => item.id !== id && item.status === destination.status)
        const anchor = others.findIndex((item) => item.id === destination.anchor)
        const index = anchor < 0 ? others.length : anchor + Number(destination.after)
        draft.cards = moveCard(draft.cards, id, destination.status, index)
        const moved = draft.cards.find((card) => card.id === id)
        if (moved) moved.updatedAt = Date.now()
      })
    }
    dragBoard = undefined
    suppressClickUntil = Date.now() + 200
    setDragging(undefined)
    setLanding(undefined)
  }
  const visibleCards = () => cards().filter((card) => matchesTask(card, filter(), label(), projectFilter()))
  const move = (id: string, status: Status) => {
    board().update((draft) => { if (!draft.columns.some((column) => column.id === status)) return; draft.cards = moveCard(draft.cards, id, status); const task = draft.cards.find((item) => item.id === id); if (task) task.updatedAt = Date.now() })
  }
  const edit = (existing?: Task, status: Status = columns()[0]?.id ?? "") => {
    if (!existing) setSelected(undefined)
    setEditor({ existing, status, scope: board() })
  }
  const remove = async (card: Task) => {
    const target = board()
    if (!await ctx.dialogs.confirm({ title: "Delete task?", description: `Delete “${card.title}”? Linked sessions will not be deleted.` })) return
    target.update((draft) => { draft.cards = draft.cards.filter((item) => item.id !== card.id) })
  }
  const editColumn = (existing?: Column) => {
    const target = board()
    ctx.dialogs.open((dialog) => <ui.Dialog title={existing ? "Edit column" : "New column"}>
      <div class="sc-root sc-inset sc-kanban-ui"><ColumnEditor existing={existing} cancel={dialog.close} save={(fields) => {
        target.update((draft) => {
          if (existing) { const column = draft.columns.find((item) => item.id === existing.id); if (column) Object.assign(column, fields) }
          else draft.columns.push({ id: crypto.randomUUID(), ...fields })
        })
        dialog.close()
      }} /></div>
    </ui.Dialog>)
  }
  const removeColumn = (column: Column) => {
    const target = board()
    ctx.dialogs.open((dialog) => <ui.Dialog title={`Delete ${column.title}?`}>
      <div class="sc-root sc-inset sc-kanban-ui"><ColumnDelete column={column} columns={target.value?.columns ?? []} count={target.value?.cards.filter((card) => card.status === column.id).length ?? 0} cancel={dialog.close} remove={(destination) => {
        const current = target.value
        if (!current) return
        const next = deleteColumn(current, column.id, destination)
        if (next === current) { ctx.toast.show({ variant: "error", title: "Column could not be deleted", description: "Keep at least one column and choose a destination for its tasks." }); return }
        target.set(next)
        dialog.close()
      }} /></div>
    </ui.Dialog>)
  }
  return <div ref={root} class="sc-root sc-kanban sc-kanban-ui">
    <Show when={detailOpen() && (view().value?.mode ?? "overlay") === "overlay"}>
      <button type="button" class="sc-detail-backdrop" tabIndex={-1} aria-label="Close task details"
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }}
        onClick={(event) => { event.stopPropagation(); closeDetail() }} />
    </Show>
    <header class="sc-board-header">
      <h2>Task board</h2>
      <div class="sc-board-filter"><ui.TextInput class="sc-kanban-input" label="Filter tasks" type="search" placeholder="Search tasks…" value={filter()} onInput={setFilter} disabled={!!dragging()} /></div>
      <ui.Menu label={label() || "All labels"} trigger="button" disabled={!!dragging()} items={[{ label: "All labels", onSelect: () => setLabel("") }, ...labels().map((name) => ({ label: name, onSelect: () => setLabel(name) }))]} />
      <ui.Menu label={projectFilter() === "none" ? "No project" : projectTitle(projects().find((item) => projectKey(item) === projectFilter()) ?? { server: "", directory: "All projects" })} trigger="button" disabled={!!dragging()} items={[
        { label: "All projects", onSelect: () => setProjectFilter("") }, { label: "No project", onSelect: () => setProjectFilter("none") },
        ...projects().map((project) => ({ label: projectTitle(project), onSelect: () => setProjectFilter(projectKey(project)) })),
      ]} />
      <Show when={filtered()}><ui.Tooltip value="Clear filters"><ui.IconButton icon="close" label="Clear filters" variant="ghost" size="small" onClick={() => { setFilter(""); setLabel(""); setProjectFilter("") }} /></ui.Tooltip></Show>
      <ui.Tooltip value="Task layout"><ui.Menu label="Task layout" icon="outline-dots" disabled={!view().ready()} items={([
        { mode: "overlay", label: "Overlay", icon: "layout-right-partial" },
        { mode: "split", label: "Split", icon: "layout-right" },
        { mode: "full", label: "Full", icon: "expand" },
      ] as const).map((item) => ({ label: `${(view().value?.mode ?? "overlay") === item.mode ? "✓ " : ""}${item.label}`, icon: item.icon, onSelect: () => view().update((draft) => { draft.mode = item.mode }) }))} /></ui.Tooltip>
      <span class="sc-board-new"><ui.Button variant="contrast" icon="plus" disabled={!board().ready()} onClick={() => edit()}>New task</ui.Button></span>
      <ui.Tooltip value="New column"><ui.IconButton icon="grid-plus" label="New column" disabled={!board().ready()} variant="ghost" onClick={() => editColumn()} /></ui.Tooltip>
    </header>
    <Show when={board().ready()} fallback={<ui.Loader />}>
      <Show when={board()} keyed>{(scope) => {
        onCleanup(() => { dragBoard = undefined; suppressClickUntil = 0; setDragging(undefined); setLanding(undefined); setDraggingColumn(undefined); setColumnIndex(undefined) })
        return <DragDropProvider
        sensors={[PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
        })]}
        onDragStart={(event) => {
          const source = event.operation.source
          if (source?.type === "column") { dragBoard = scope; suppressClickUntil = Infinity; setColumnIndex(columns().findIndex((column) => column.id === source.data.columnID)); setDraggingColumn(String(source.data.columnID)); return }
          const card = cards().find((card) => card.id === source?.id)
          if (!source || !card) return
          // Measure before the source leaves flow; its slot takes exactly this space.
          setDragHeight(source.element?.getBoundingClientRect().height ?? 100)
          setDragTop((source.element as HTMLElement | undefined)?.offsetTop ?? 0)
          dragBoard = scope
          suppressClickUntil = Infinity
          setLanding({ status: card.status, anchor: card.id, after: false })
          setDragging(card.id)
        }}
        // Show an insertion marker instead of letting optimistic sorting move Solid-owned DOM.
        onDragOver={(event) => { event.preventDefault(); preview(event.operation) }}
        onDragMove={(event) => preview(event.operation, event.to ?? event.operation.position.current)}
        onDragEnd={finish}>
      <div class="sc-board-workspace" data-mode={view().value?.mode ?? "overlay"} data-detail={detailOpen()} style={{ "--sc-board-bottom": `${boardBottom()}px` }}>
      <div ref={observeBoardHeight} class="sc-board-columns" style={{ "grid-template-columns": displayColumns().map((column) => collapsed(column.id) ? "44px" : "minmax(240px, 1fr)").join(" ") }}>
        <For each={displayColumns()}>{(column, index) => <DropColumn status={column.id} index={index()} disabled={filtered()} active={landing()?.status === column.id} collapsed={collapsed(column.id)}>{(handleRef) => <>
          <Show when={!collapsed(column.id)} fallback={<><ui.Tooltip value={`Expand ${column.title}`}><ui.IconButton icon="chevron-right" label={`Expand ${column.title}`} variant="ghost" size="small" onClick={() => toggleColumn(column.id)} /></ui.Tooltip><button ref={handleRef} type="button" class="sc-column-rail sc-column-drag" aria-label={`Drag ${column.title} column`}>{column.title}</button><span class="sc-column-count">{cards().filter((card) => card.status === column.id).length}</span></>}>
           <header><button ref={handleRef} type="button" class="sc-column-drag" aria-label={`Drag ${column.title} column`}><span class="sc-column-dot" style={{ background: column.color }} /><span>{column.title}</span><span class="sc-column-count">{cards().filter((card) => card.status === column.id).length}</span></button>
              <span class="sc-column-actions"><ui.Tooltip value={`Add task to ${column.title}`}><ui.IconButton icon="plus" label={`Add task to ${column.title}`} variant="ghost" size="small" onClick={() => edit(undefined, column.id)} /></ui.Tooltip>
              <ui.Menu label={`${column.title} column options`} icon="outline-dots" items={[{ label: "Edit column", icon: "edit", onSelect: () => editColumn(column) }, { label: "Delete column", icon: "trash", disabled: columns().length <= 1, onSelect: () => removeColumn(column) }]} />
              <ui.Tooltip value={`Collapse ${column.title}`}><ui.IconButton icon="chevron-left" label={`Collapse ${column.title}`} variant="ghost" size="small" disabled={!view().ready()} onClick={() => toggleColumn(column.id)} /></ui.Tooltip></span></header>
          <div class="sc-column-cards">
            <For each={visibleCards().filter((card) => card.status === column.id)}>{(card, index) => <>
              <Show when={landing()?.anchor === card.id && !landing()?.after}><DropSlot height={dragHeight()} /></Show>
                <SortableTask card={card} index={index()} disabled={filtered()} active={running(card)} selected={selectedTask()?.id === card.id} origin={dragging() === card.id} originTop={dragTop()} open={() => {
                  if (Date.now() < suppressClickUntil) return
                  if (selectedTask()?.id === card.id) return closeDetail()
                  setEditor(undefined)
                  setSelected({ id: card.id, scope: board() })
                }}>
                 <TaskSummary card={card} />
              </SortableTask>
              <Show when={landing()?.anchor === card.id && landing()?.after}><DropSlot height={dragHeight()} /></Show>
            </>}</For>
            <Show when={landing()?.status === column.id && !landing()?.anchor}><DropSlot height={dragHeight()} /></Show>
            <Show when={!visibleCards().some((card) => card.status === column.id)}><div class="sc-empty-column">{filtered() ? "No matching tasks" : "No tasks yet"}</div></Show>
          </div>
          </Show>
        </>}</DropColumn>}</For>
      </div>
      <Show when={detailOpen()}>
        <ResizableDetail mode={view().value?.mode ?? "overlay"}
          width={view().value?.mode === "split" ? view().value?.splitWidth ?? 380 : view().value?.overlayWidth ?? 460}
          saveWidth={(width) => view().update((draft) => { if (draft.mode === "split") draft.splitWidth = width; else draft.overlayWidth = width })}>
        <Show when={editing()} keyed fallback={<Show when={selectedTask()}>{(task) => <TaskDetail task={task()} session={props.session} columns={columns()}
          close={closeDetail} edit={() => edit(task())} remove={() => { void remove(task()) }} move={(status) => move(task().id, status)} start={() => props.start(task())}
          update={(fields) => board().update((draft) => { const current = draft.cards.find((card) => card.id === task().id); if (current) Object.assign(current, fields, { updatedAt: Date.now() }) })} />
        }</Show>}>{(state) => <section class="sc-task-detail" aria-label={state.existing ? "Edit task" : "New task"} onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); setEditor(undefined) } }}>
          <header class="sc-detail-toolbar"><span>{state.existing ? "Edit task" : "New task"}</span><ui.IconButton icon="close" label="Close task editor" variant="ghost" onClick={closeDetail} /></header>
          <div class="sc-detail-body"><TaskEditor existing={state.existing} columns={columns()} projects={projects()} project={projectFilter() === "none" ? undefined : projects().find((item) => projectKey(item) === projectFilter()) ?? currentProject()} status={state.status} cancel={() => setEditor(undefined)} save={(fields) => {
            const id = state.existing?.id ?? crypto.randomUUID()
            state.scope.update((draft) => {
              if (!draft.columns.some((column) => column.id === fields.status)) return
              if (state.existing) {
                const current = draft.cards.find((card) => card.id === id)
                if (!current) return
                if (current.status !== fields.status) draft.cards = moveCard(draft.cards, id, fields.status)
                Object.assign(draft.cards.find((card) => card.id === id)!, fields, { updatedAt: Date.now() })
              } else draft.cards.push({ ...fields, id, session: "", sessions: [], updatedAt: Date.now() })
            })
            setEditor(undefined)
            setSelected({ id, scope: state.scope })
          }} /></div>
        </section>}</Show>
        </ResizableDetail>
      </Show>
      </div>
      <DragOverlay dropAnimation={null}><Show when={cards().find((card) => card.id === dragging())} keyed>{(card) => <div class="sc-root sc-kanban-ui"><article class="sc-task sc-task-overlay"><h4 class="sc-task-title">{card.title}</h4><TaskSummary card={card} /></article></div>}</Show><Show when={draggingColumn()}><div class="sc-root sc-kanban-ui sc-column-overlay">{columns().find((column) => column.id === draggingColumn())?.title}</div></Show></DragOverlay>
      </DragDropProvider>
      }}</Show>
    </Show>
  </div>
}

function DropColumn(props: { status: Status; index: number; disabled: boolean; active: boolean; collapsed: boolean; children: (handleRef: (element: Element) => void) => JSX.Element }) {
  const sortable = useSortable({
    get id() { return `column-sort:${props.status}` }, get index() { return props.index }, group: "columns",
    type: "column", accept: "column", get data() { return { columnID: props.status } },
  })
  const drop = useDroppable({
    get id() { return `column:${props.status}` },
    get disabled() { return props.disabled },
    data: { status: props.status }, accept: "task", collisionPriority: -1,
  })
  return <section ref={(element) => { drop.ref(element); sortable.ref(element) }} class="sc-board-column" data-column-dragging={sortable.isDragSource()} data-kanban-column={props.status} data-collapsed={props.collapsed} data-over={props.active}>{props.children(sortable.handleRef)}</section>
}

function SortableTask(props: { card: Task; index: number; disabled: boolean; selected: boolean; active: boolean; origin: boolean; originTop: number; open(): void; children: JSX.Element }) {
  const sortable = useSortable({
    get id() { return props.card.id },
    get index() { return props.index },
    get group() { return props.card.status },
    get disabled() { return props.disabled },
    type: "task", accept: "task", collisionPriority: 1,
  })
  return <button type="button" ref={(element) => { sortable.ref(element); sortable.handleRef(element) }}
    class="sc-task" data-task-id={props.card.id} data-dragging={props.origin} data-selected={props.selected} data-active={props.active}
    style={{ "--sc-drag-top": `${props.originTop}px` }} aria-label={`Open ${props.card.title}`} onClick={props.open}>
    <span class="sc-task-title">{props.card.title}</span>
    {props.children}
  </button>
}

function DropSlot(props: { height: number }) {
  return <div class="sc-drop-slot" style={{ height: `${props.height}px` }} aria-hidden="true" />
}

function TaskSummary(props: { card: Task }) {
  const ui = usePlugin().ui
  const items = createMemo(() => checklistItems(props.card.description))
  const excerpt = createMemo(() => markdownExcerpt(props.card.description))
  const labels = () => taskLabels(props.card.labels)
  return <>
    <Show when={props.card.project}>{(project) => <span class="sc-task-project" title={project().directory}><ui.Icon name="folder" size="small" />{projectTitle(project())}</span>}</Show>
    <Show when={excerpt()}><span class="sc-task-excerpt">{excerpt()}</span></Show>
    <span class="sc-card-footer"><span class="sc-task-labels"><For each={labels().slice(0, 2)}>{(label) => <span>{label}</span>}</For><Show when={labels().length > 2}><span title={labels().slice(2).join(", ")}>+{labels().length - 2}</span></Show></span>
      <span class="sc-card-meta"><Show when={items().length}><span title="Checklist progress"><ui.Icon name="checklist" size="small" />{items().filter((item) => item.checked).length}/{items().length}</span></Show>
        <Show when={taskLinks(props.card, "").length}>{(count) => <span title={`${count()} linked ${count() === 1 ? "session" : "sessions"}`} aria-label={`${count()} linked ${count() === 1 ? "session" : "sessions"}`}><ui.Icon name="link" size="small" />{count()}</span>}</Show>
        <Show when={props.card.updatedAt}><time title={new Date(props.card.updatedAt!).toLocaleString()}>{new Date(props.card.updatedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></Show>
      </span>
    </span>
  </>
}

function TaskEditor(props: { existing?: Task; columns: readonly Column[]; projects: readonly TaskProject[]; project?: TaskProject; status: Status; cancel(): void; save(fields: Pick<Task, "title" | "description" | "labels" | "status" | "project">): void }) {
  const ui = usePlugin().ui
  const [title, setTitle] = createSignal(props.existing?.title ?? "")
  const [description, setDescription] = createSignal(props.existing?.description ?? "")
  const [labels, setLabels] = createSignal(props.existing?.labels ?? "")
  const [status, setStatus] = createSignal(props.existing?.status ?? props.status)
  const [project, setProject] = createSignal<TaskProject | undefined>(props.existing ? props.existing.project : props.project)
  const [preview, setPreview] = createSignal(false)
  return <form class="sc-task-editor" onSubmit={(event) => {
    event.preventDefault()
    if (title().trim()) props.save({ title: title().trim(), description: description().trim(), labels: labels().trim(), status: status(), project: project() })
  }}>
    <div class="sc-editor-field"><span>Title</span><ui.TextInput class="sc-kanban-input" label="Title" value={title()} onInput={setTitle} placeholder="What needs to be done?" autofocus /></div>
    <div class="sc-editor-field"><span>Status</span><ui.Menu label={props.columns.find((column) => column.id === status())?.title ?? "Choose column"} trigger="button" items={props.columns.map((column) => ({ label: column.title, onSelect: () => setStatus(column.id) }))} /></div>
    <div class="sc-editor-field"><span>Project</span><ui.Menu label={project() ? projectTitle(project()!) : "No project"} trigger="button" items={[
      { label: "No project", onSelect: () => setProject(undefined) },
      ...props.projects.map((item) => ({ label: projectTitle(item), onSelect: () => setProject(item) })),
    ]} /></div>
    <div class="sc-editor-field"><div class="sc-description-heading"><span>Description</span><div class="sc-actions"><ui.Button size="small" variant={preview() ? "ghost-muted" : "neutral"} onClick={() => setPreview(false)}>Write</ui.Button><ui.Button size="small" variant={preview() ? "neutral" : "ghost-muted"} onClick={() => setPreview(true)}>Preview</ui.Button></div></div>
      <Show when={preview()} fallback={<textarea aria-label="Description" value={description()} onInput={(event) => setDescription(event.currentTarget.value)} placeholder="Context, acceptance criteria… Markdown and - [ ] checklists supported." />}><div class="sc-markdown-preview"><Show when={description()} fallback={<p>Nothing to preview yet.</p>}><ui.Markdown text={description()} /></Show></div></Show>
    </div>
    <div class="sc-editor-field"><span>Labels</span><ui.TextInput class="sc-kanban-input" label="Labels" value={labels()} onInput={setLabels} placeholder="ui, bug, priority" /></div>
    <div class="sc-editor-actions"><ui.Button type="button" onClick={props.cancel}>Cancel</ui.Button><ui.Button type="submit" variant="contrast" disabled={!title().trim() || !props.columns.some((column) => column.id === status())}>Save task</ui.Button></div>
  </form>
}

const columnColors = [
  { name: "Neutral", value: "var(--v2-icon-icon-muted)" },
  { name: "Blue", value: "var(--v2-state-fg-info)" },
  { name: "Amber", value: "var(--v2-state-fg-warning)" },
  { name: "Accent", value: "var(--v2-text-text-accent)" },
  { name: "Green", value: "var(--v2-state-fg-success)" },
  { name: "Red", value: "var(--v2-state-fg-danger)" },
]

function ColumnEditor(props: { existing?: Column; cancel(): void; save(fields: Pick<Column, "title" | "color">): void }) {
  const ui = usePlugin().ui
  const [title, setTitle] = createSignal(props.existing?.title ?? "")
  const [color, setColor] = createSignal(props.existing?.color ?? columnColors[0].value)
  return <form class="sc-task-editor" onSubmit={(event) => { event.preventDefault(); if (title().trim()) props.save({ title: title().trim(), color: color() }) }}>
    <div class="sc-editor-field"><span>Name</span><ui.TextInput class="sc-kanban-input" label="Column name" value={title()} onInput={setTitle} autofocus placeholder="e.g. Blocked" /></div>
    <div class="sc-editor-field"><span>Color</span><div class="sc-column-colors" role="group" aria-label="Column color"><For each={columnColors}>{(item) => <ui.Tooltip value={item.name}><button type="button" aria-label={item.name} aria-pressed={color() === item.value} style={{ background: item.value }} onClick={() => setColor(item.value)} /></ui.Tooltip>}</For></div></div>
    <div class="sc-editor-actions"><ui.Button onClick={props.cancel}>Cancel</ui.Button><ui.Button type="submit" variant="contrast" disabled={!title().trim()}>Save column</ui.Button></div>
  </form>
}

function ColumnDelete(props: { column: Column; columns: readonly Column[]; count: number; cancel(): void; remove(destination?: string): void }) {
  const ui = usePlugin().ui
  const others = () => props.columns.filter((column) => column.id !== props.column.id)
  const [destination, setDestination] = createSignal(others()[0]?.id)
  return <div class="sc-task-editor">
    <p>{props.count ? `${props.count} task${props.count === 1 ? "" : "s"} will be moved to another column. No tasks will be deleted.` : "This column is empty. Tasks will not be deleted."}</p>
    <Show when={props.count}><div class="sc-editor-field"><span>Move tasks to</span><ui.Menu label={others().find((column) => column.id === destination())?.title ?? "Choose column"} trigger="button" items={others().map((column) => ({ label: column.title, onSelect: () => setDestination(column.id) }))} /></div></Show>
    <div class="sc-editor-actions"><ui.Button onClick={props.cancel}>Cancel</ui.Button><ui.Button variant="danger" disabled={!others().length || (!!props.count && !destination())} onClick={() => props.remove(destination())}>Delete column</ui.Button></div>
  </div>
}
