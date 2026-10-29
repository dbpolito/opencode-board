import { test } from "node:test"
import assert from "node:assert/strict"
import { globalBoard, importProjectBoard } from "../src/gui/kanban-storage.ts"
import { initialBoard, taskLinks } from "../src/gui/kanban-model.ts"

function host() {
  const stores = new Map()
  return { storage: { store(key, options) {
    assert.equal(key, "kanban-v2")
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

test("project boards import once, preserve session servers, and do not resurrect deleted tasks", () => {
  const source = { ...initialBoard(), cards: [{ id: "one", title: "Task", description: "", labels: "", status: "backlog", session: "session-1" }] }
  const project = { server: "remote", directory: "/project" }
  const merged = importProjectBoard(initialBoard(), source, project)
  assert.equal(merged.cards.length, 1)
  assert.deepEqual(merged.cards[0].project, project)
  assert.deepEqual(taskLinks(merged.cards[0], "wrong-server"), [{ id: "session-1", server: "remote" }])
  const deleted = { ...merged, cards: [] }
  assert.equal(importProjectBoard(deleted, source, project), deleted)
  assert.equal(source.cards[0].session, "session-1")
})

test("imports preserve conflicting columns and equal task IDs from different projects", () => {
  const source = { ...initialBoard(), cards: [{ id: "same", title: "Task", description: "", labels: "", status: "backlog", session: "" }] }
  const first = importProjectBoard(initialBoard(), source, { server: "sidecar", directory: "/one" })
  source.columns[0].title = "Ideas"
  const merged = importProjectBoard(first, source, { server: "sidecar", directory: "/two" })
  assert.equal(merged.cards.length, 2)
  assert.notEqual(merged.cards[0].id, merged.cards[1].id)
  assert.notEqual(merged.cards[0].status, merged.cards[1].status)
  assert.equal(merged.columns.find((column) => column.id === merged.cards[1].status).title, "Ideas")
})
