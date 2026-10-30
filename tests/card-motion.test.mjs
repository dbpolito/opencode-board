import { test } from "node:test"
import assert from "node:assert/strict"
import { animateCardMoves } from "../src/gui/card-motion.ts"

function host(t) {
  let mutation, resize
  const oldMutation = globalThis.MutationObserver
  const oldResize = globalThis.ResizeObserver
  globalThis.MutationObserver = class { constructor(fn) { mutation = this; this.update = fn } observe() {} disconnect() { this.closed = true } }
  globalThis.ResizeObserver = class { constructor(fn) { resize = this; this.update = fn } observe() {} disconnect() { this.closed = true } }
  t.after(() => { globalThis.MutationObserver = oldMutation; globalThis.ResizeObserver = oldResize })
  const listeners = () => ({ addEventListener(name, fn) { this[name] = fn }, removeEventListener(name) { delete this[name] } })
  const media = { ...listeners(), matches: false }
  const doc = { ...listeners(), hidden: false, defaultView: { matchMedia: () => media }, createElement: () => new Element() }
  class Element {
    constructor(id, left = 0, top = 0) { this.dataset = id ? { taskId: id } : {}; this.style = { visibility: "" }; this.box = { left, top, width: 200, height: 50 }; this.children = []; this.ownerDocument = doc; this.clientLeft = this.clientTop = this.scrollLeft = this.scrollTop = 0; Object.assign(this, listeners()) }
    getBoundingClientRect() { return { ...this.box } }
    querySelectorAll() { return this.cards ?? [] }
    querySelector() { return this.dragging ? {} : null }
    appendChild(child) { this.children.push(child); child.parent = this }
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this) }
    setAttribute() {}
    removeAttribute() {}
    cloneNode() { return new Element() }
    animate(frames, options) { this.frames = frames; this.options = options; this.animation = { cancel() { this.cancelled = true } }; return this.animation }
  }
  const root = new Element()
  const columns = new Element()
  const a = new Element("a", 0, 20)
  const b = new Element("b", 0, 80)
  columns.cards = [a, b]
  const cleanup = animateCardMoves(root, columns)
  t.after(cleanup)
  return { root, columns, a, b, media, Element, cleanup, update: () => mutation.update(), resize: () => resize.update(), ghosts: () => root.children[0]?.children ?? [] }
}

test("reordering animates displaced cards without transforming or moving Solid-owned nodes", (t) => {
  const h = host(t)
  h.a.box.top = 80; h.b.box.top = 20
  h.columns.cards = [h.b, h.a]
  h.update()
  assert.equal(h.ghosts().length, 2)
  assert.equal(h.a.style.visibility, "hidden")
  assert.equal(h.a.animation, undefined)
  const a = h.ghosts()[1]
  assert.match(a.frames[0].transform, /translate\(0px, 20px\)/)
  assert.match(a.frames[1].transform, /translate\(0px, 80px\)/)
  assert.equal(a.options.duration, 360)
  for (const ghost of [...h.ghosts()]) ghost.animation.onfinish()
  assert.equal(h.a.style.visibility, "")
  assert.equal(h.ghosts().length, 0)
})

test("a card remounted in another column flies across the board rather than being clipped by a column", (t) => {
  const h = host(t)
  const destination = new h.Element("a", 300, 20)
  h.columns.cards = [destination, h.b]
  h.update()
  assert.equal(h.ghosts().length, 1)
  assert.match(h.ghosts()[0].frames[0].transform, /translate\(0px, 20px\)/)
  assert.match(h.ghosts()[0].frames[1].transform, /translate\(300px, 20px\)/)
  assert.equal(destination.style.visibility, "hidden")
  assert.equal(h.a.style.visibility, "")
  h.cleanup()
  assert.equal(destination.style.visibility, "")
  assert.equal(h.root.children.length, 0)
})

test("an interrupted move continues from its current visual position and restores the real card", (t) => {
  const h = host(t)
  h.a.box.left = 300
  h.update()
  const old = h.ghosts()[0]
  old.box.left = 150; old.box.top = 20
  h.a.box.left = 600
  h.update()
  assert.equal(old.animation.cancelled, true)
  assert.match(h.ghosts()[0].frames[0].transform, /translate\(150px, 20px\)/)
  h.resize()
  assert.equal(h.a.style.visibility, "")
  assert.equal(h.ghosts().length, 0)
})

test("reduced motion and active dragging skip flight animations", (t) => {
  const h = host(t)
  h.media.matches = true
  h.a.box.top = 100
  h.update()
  assert.equal(h.ghosts().length, 0)
  h.media.matches = false
  h.columns.dragging = true
  h.a.box.top = 150
  h.update()
  h.columns.dragging = false
  h.a.box.top = 200
  h.update()
  assert.equal(h.ghosts().length, 0)
  h.a.box.top = 250
  h.update()
  assert.equal(h.ghosts().length, 1)
  h.media.matches = true
  h.media.change()
  assert.equal(h.ghosts().length, 0)
  assert.equal(h.a.style.visibility, "")
})
