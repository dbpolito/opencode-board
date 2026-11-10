export function cardMenuPosition(point: { x: number; y: number }, bounds: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }) {
  return {
    x: Math.max(4, Math.min(point.x - bounds.left, bounds.width - size.width - 4)),
    y: Math.max(4, Math.min(point.y - bounds.top, bounds.height - size.height - 4)),
  }
}

export function bindCardMenu(menu: HTMLElement, close: () => void, restoreFocus: () => void) {
  const doc = menu.ownerDocument
  const win = doc.defaultView
  const items = () => [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  const outside = (event: Event) => { if (!menu.contains(event.target as Node)) close() }
  const keydown = (event: KeyboardEvent) => {
    const buttons = items()
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement)
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") { event.preventDefault(); restoreFocus() }
      event.stopPropagation()
      close()
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
  }
  const scroll = (event: Event) => { if (!menu.contains(event.target as Node)) close() }
  menu.addEventListener("keydown", keydown)
  doc.addEventListener("pointerdown", outside, { capture: true })
  doc.addEventListener("focusin", outside)
  doc.addEventListener("scroll", scroll, { capture: true })
  win?.addEventListener("resize", close)
  items()[0]?.focus()
  return () => {
    menu.removeEventListener("keydown", keydown)
    doc.removeEventListener("pointerdown", outside, { capture: true })
    doc.removeEventListener("focusin", outside)
    doc.removeEventListener("scroll", scroll, { capture: true })
    win?.removeEventListener("resize", close)
  }
}
