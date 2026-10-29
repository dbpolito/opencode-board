import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { clampDetailWidth, detailWidthBounds, type DetailMode } from "./kanban-model"

export function ResizableDetail(props: { mode: DetailMode; width: number; saveWidth(width: number): void; children: JSX.Element }) {
  const [available, setAvailable] = createSignal(0)
  const [draft, setDraft] = createSignal<number>()
  const [resizing, setResizing] = createSignal(false)
  let shell: HTMLDivElement | undefined
  let drag: { x: number; width: number; pointer: number; mode: DetailMode } | undefined
  const canResize = () => props.mode !== "full" && !(props.mode === "split" && available() <= 700)
  const width = () => clampDetailWidth(draft() ?? props.width, available(), props.mode)
  const bounds = () => detailWidthBounds(available(), props.mode)
  const cancel = () => { drag = undefined; setDraft(undefined); setResizing(false) }
  onMount(() => {
    const workspace = shell?.parentElement
    if (!workspace) return
    const measure = () => setAvailable(workspace.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    onCleanup(() => observer.disconnect())
  })
  onCleanup(cancel)
  const resizeKey = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 10
    let next: number
    if (event.key === "ArrowLeft") next = width() + step
    else if (event.key === "ArrowRight") next = width() - step
    else if (event.key === "Home") next = bounds().min
    else if (event.key === "End") next = bounds().max
    else return
    event.preventDefault()
    event.stopPropagation()
    props.saveWidth(clampDetailWidth(next, available(), props.mode))
  }
  return <div ref={shell} class="sc-detail-shell" data-resizing={resizing()} style={{ "--sc-detail-width": `${width()}px` }}>
    <Show when={canResize()}><div class="sc-detail-resizer" role="separator" tabIndex={0} aria-label="Resize task details" aria-orientation="vertical"
      aria-valuemin={bounds().min} aria-valuemax={bounds().max} aria-valuenow={width()} onKeyDown={resizeKey}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault(); event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag = { x: event.clientX, width: width(), pointer: event.pointerId, mode: props.mode }
        setResizing(true)
      }}
      onPointerMove={(event) => {
        if (!drag || drag.pointer !== event.pointerId) return
        if (drag.mode !== props.mode || !canResize()) return cancel()
        event.preventDefault(); event.stopPropagation()
        setDraft(clampDetailWidth(drag.width + drag.x - event.clientX, available(), props.mode))
      }}
      onPointerUp={(event) => {
        if (!drag || drag.pointer !== event.pointerId) return
        event.preventDefault(); event.stopPropagation()
        if (drag.mode === props.mode && canResize()) props.saveWidth(width())
        cancel()
        event.currentTarget.releasePointerCapture(event.pointerId)
      }} onPointerCancel={cancel} onLostPointerCapture={cancel} onDblClick={() => props.saveWidth(clampDetailWidth(props.mode === "split" ? 380 : 460, available(), props.mode))}>
      <span />
    </div></Show>
    {props.children}
  </div>
}
