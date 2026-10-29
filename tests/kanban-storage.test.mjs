import { test } from "node:test"
import assert from "node:assert/strict"
import { globalBoard } from "../src/gui/kanban-storage.ts"

function host() {
  const stores = new Map()
  return { storage: { store(key, options) {
    assert.equal(key, "kanban-v2")
    assert.equal(options.scope, "global")
    assert.equal(options.from, "plugin.opencode-desktop-showcase.kanban-v2")
    const scoped = JSON.stringify([key, options.scope])
    if (!stores.has(scoped)) stores.set(scoped, {
      value: structuredClone(options.initial), ready: () => true,
      update(fn) { fn(this.value) },
    })
    return stores.get(scoped)
  } } }
}

test("shortcut and board share global task counts", () => {
  const ctx = host()
  const session = { id: "one", server: { id: "sidecar" }, directory: "/project" }
  const board = globalBoard(ctx)
  const shortcut = globalBoard(ctx)
  assert.equal(board, shortcut)
  assert.equal(shortcut.value.cards.length, 0)
  board.update((draft) => { draft.cards.push({ id: "task", status: "done" }) })
  assert.equal(shortcut.value.cards.length, 1)
  board.update((draft) => { draft.cards = [] })
  assert.equal(shortcut.value.cards.length, 0)
})

test("global storage is not scoped to a directory or server", () => {
  const ctx = host()
  const session = { server: { id: "sidecar" }, directory: "/project" }
  const board = globalBoard(ctx)
  board.update((draft) => { draft.cards.push({ id: "saved" }) })
  assert.equal(globalBoard(ctx), board)
  assert.equal(globalBoard(ctx).value.cards[0].id, "saved")
})
