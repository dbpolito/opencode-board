import { test } from "node:test"
import assert from "node:assert/strict"
import { bindCardMenu, cardMenuPosition } from "../src/gui/card-menu.ts"

test("card menus use board-relative coordinates and stay inside the board edges", () => {
  const bounds = { left: 100, top: 50, width: 400, height: 300 }
  const size = { width: 172, height: 80 }
  assert.deepEqual(cardMenuPosition({ x: 150, y: 100 }, bounds, size), { x: 50, y: 50 })
  assert.deepEqual(cardMenuPosition({ x: 499, y: 349 }, bounds, size), { x: 224, y: 216 })
  assert.deepEqual(cardMenuPosition({ x: 0, y: 0 }, bounds, size), { x: 4, y: 4 })
})

function fixture() {
  const doc = new EventTarget()
  doc.defaultView = new EventTarget()
  const buttons = [0, 1].map(() => ({ focus() { doc.activeElement = this } }))
  const menu = new EventTarget()
  menu.ownerDocument = doc
  menu.querySelectorAll = () => buttons
  menu.contains = (target) => target === menu || buttons.includes(target)
  let closed = 0, restored = 0
  const cleanup = bindCardMenu(menu, () => closed++, () => restored++)
  const key = (value) => {
    const event = new Event("keydown", { cancelable: true })
    Object.defineProperty(event, "key", { value })
    menu.dispatchEvent(event)
    return event
  }
  return { doc, menu, buttons, key, cleanup, closed: () => closed, restored: () => restored }
}

test("card menu supports arrow navigation, Home/End, and Escape focus restoration", () => {
  const host = fixture()
  assert.equal(host.doc.activeElement, host.buttons[0])
  assert.equal(host.key("ArrowUp").defaultPrevented, true)
  assert.equal(host.doc.activeElement, host.buttons[1])
  host.key("ArrowDown")
  assert.equal(host.doc.activeElement, host.buttons[0])
  host.key("End")
  assert.equal(host.doc.activeElement, host.buttons[1])
  host.key("Home")
  assert.equal(host.doc.activeElement, host.buttons[0])
  assert.equal(host.key("Escape").defaultPrevented, true)
  assert.equal(host.closed(), 1)
  assert.equal(host.restored(), 1)
  host.cleanup()
})

test("card menu dismisses on outside interaction, scroll, resize, or Tab and removes listeners", () => {
  const host = fixture()
  const inside = new Event("pointerdown")
  Object.defineProperty(inside, "target", { value: host.buttons[0] })
  host.doc.dispatchEvent(inside)
  assert.equal(host.closed(), 0)
  host.doc.dispatchEvent(new Event("pointerdown"))
  host.doc.dispatchEvent(new Event("focusin"))
  host.doc.dispatchEvent(new Event("scroll"))
  host.doc.defaultView.dispatchEvent(new Event("resize"))
  assert.equal(host.key("Tab").defaultPrevented, false)
  assert.equal(host.closed(), 5)
  host.cleanup()
  host.doc.dispatchEvent(new Event("pointerdown"))
  host.doc.dispatchEvent(new Event("focusin"))
  host.doc.dispatchEvent(new Event("scroll"))
  host.doc.defaultView.dispatchEvent(new Event("resize"))
  host.key("Escape")
  assert.equal(host.closed(), 5)
  assert.equal(host.restored(), 0)
})
