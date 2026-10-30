type Box = { left: number; top: number; width: number; height: number }
type Snapshot = { element: HTMLElement; box: Box }
type Flight = { ghost: HTMLElement; cancel(): void }

// Animate visual copies across clipping/column boundaries. Solid and dnd-kit
// retain ownership of the real card nodes and their transforms.
export function animateCardMoves(root: HTMLElement, columns: HTMLElement) {
  const media = root.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)")
  const layer = root.ownerDocument.createElement("div")
  layer.className = "sc-card-motion-layer"
  layer.setAttribute("aria-hidden", "true")
  layer.inert = true
  root.appendChild(layer)
  const flights = new Map<string, Flight>()
  const measure = () => new Map([...columns.querySelectorAll<HTMLElement>("[data-task-id]")].map((element) => [element.dataset.taskId!, { element, box: element.getBoundingClientRect() }]))
  let previous = measure()
  let dragging = false
  const clear = () => { [...flights.values()].forEach((flight) => flight.cancel()); flights.clear() }
  const reset = () => { clear(); previous = measure() }
  const update = () => {
    const next = measure()
    const isDragging = !!columns.querySelector('[data-dragging="true"], [data-column-dragging="true"]')
    if (isDragging || dragging || media?.matches || root.ownerDocument.hidden) {
      clear(); previous = next; dragging = isDragging
      return
    }
    const origin = root.getBoundingClientRect()
    for (const [id, current] of next) {
      const old = previous.get(id)
      const inFlight = flights.get(id)
      const from = inFlight?.ghost.getBoundingClientRect() ?? old?.box
      if (!from || !from.width || !from.height || !current.box.width || !current.box.height) continue
      // Ignore content-only updates and sub-pixel layout noise.
      const changed = Math.abs(from.left - current.box.left) > 0.5 || Math.abs(from.top - current.box.top) > 0.5
      if (!changed && !inFlight) continue
      inFlight?.cancel()
      if (!changed || typeof current.element.animate !== "function") continue
      const ghost = current.element.cloneNode(true) as HTMLElement
      ghost.removeAttribute("id")
      ghost.removeAttribute("data-task-id")
      ghost.removeAttribute("data-dragging")
      ghost.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"))
      ghost.tabIndex = -1
      ghost.inert = true
      Object.assign(ghost.style, { position: "absolute", left: "0", top: "0", boxSizing: "border-box", width: `${current.box.width}px`, height: `${current.box.height}px`, margin: "0", transformOrigin: "top left", visibility: "visible" })
      layer.appendChild(ghost)
      const visibility = current.element.style.visibility
      current.element.style.visibility = "hidden"
      const transform = (box: Box) => `translate(${box.left - origin.left - root.clientLeft + root.scrollLeft}px, ${box.top - origin.top - root.clientTop + root.scrollTop}px) scale(${box.width / current.box.width}, ${box.height / current.box.height})`
      const animation = ghost.animate([{ transform: transform(from) }, { transform: transform(current.box) }], { duration: 360, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" })
      const finish = () => {
        if (flights.get(id)?.ghost !== ghost) return
        flights.delete(id)
        current.element.style.visibility = visibility
        ghost.remove()
      }
      flights.set(id, { ghost, cancel() { animation.onfinish = null; animation.oncancel = null; animation.cancel(); finish() } })
      animation.onfinish = finish
      animation.oncancel = finish
    }
    for (const [id, flight] of flights) if (!next.has(id)) flight.cancel()
    previous = next
  }
  const observer = new MutationObserver(update)
  observer.observe(columns, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-dragging", "data-column-dragging"] })
  const resize = new ResizeObserver(reset)
  resize.observe(columns)
  columns.addEventListener("scroll", reset, true)
  media?.addEventListener("change", reset)
  root.ownerDocument.addEventListener("visibilitychange", reset)
  return () => {
    observer.disconnect(); resize.disconnect(); clear(); layer.remove()
    columns.removeEventListener("scroll", reset, true)
    media?.removeEventListener("change", reset)
    root.ownerDocument.removeEventListener("visibilitychange", reset)
  }
}
