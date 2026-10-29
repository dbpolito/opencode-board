import { test } from "node:test"
import assert from "node:assert/strict"
import { Schema } from "effect"
import { BoardSchema, BoardViewSchema, clampDetailWidth, columns, deleteColumn, detailWidthBounds, initialBoard, matchesTask, moveCard, placeColumn, projectKey, taskIsRunning, taskLabels, taskPrompt, taskSessions, taskLinks } from "../src/gui/kanban-model.ts"

const card = { id: "one", title: "Build board", description: "Keep tasks per workspace", labels: "ui, desktop", status: "backlog", session: "session-1" }

test("running state requires a linked session and a connected server reporting activity", () => {
  assert.equal(taskIsRunning(card, () => "running", true), true)
  assert.equal(taskIsRunning(card, () => "idle", true), false)
  assert.equal(taskIsRunning(card, () => undefined, true), false)
  assert.equal(taskIsRunning(card, () => "running", false), false)
  assert.equal(taskIsRunning({ ...card, session: "" }, () => "running", true), false)
  // Board placement and selection do not determine session activity.
  assert.equal(taskIsRunning({ ...card, status: "done" }, () => "running", true), true)
  assert.equal(taskIsRunning({ ...card, status: "progress" }, () => "idle", true), false)
})

test("multiple session links preserve legacy links, deduplicate, and round-trip", () => {
  assert.deepEqual(taskSessions(card), ["session-1"])
  const task = { ...card, sessions: ["session-2", "session-1", "", "session-2"] }
  assert.deepEqual(taskSessions(task), ["session-1", "session-2"])
  const board = { ...initialBoard(), cards: [task] }
  assert.deepEqual(Schema.decodeUnknownSync(BoardSchema)(board), board)
  assert.deepEqual(taskSessions({ session: "", sessions: [] }), [])
})

test("any linked running session activates the card, but unlinked activity does not", () => {
  const task = { ...card, sessions: ["session-2"] }
  assert.equal(taskIsRunning(task, (id) => id === "session-2" ? "running" : "idle", true), true)
  assert.equal(taskIsRunning(task, (id) => id === "unlinked" ? "running" : "idle", true), false)
  assert.equal(taskIsRunning(task, () => "running", false), false)
})

test("session links remain distinct across servers and do not follow project changes", () => {
  const task = { ...card, session: "", links: [{ id: "same", server: "one" }, { id: "same", server: "two" }], project: { server: "three", directory: "/project" } }
  assert.equal(taskLinks(task, "fallback").length, 2)
  assert.equal(taskIsRunning(task, (id, server) => server === "two" ? "running" : "idle", true), true)
  assert.deepEqual(taskLinks(task, "fallback").map((link) => link.server), ["one", "two"])
})

test("projects filter one shared task collection and combine with search and labels", () => {
  const project = { server: "sidecar", directory: "/project" }
  const assigned = { ...card, project }
  assert.equal(matchesTask(assigned, "build", "ui", projectKey(project)), true)
  assert.equal(matchesTask(assigned, "", "", ""), true)
  assert.equal(matchesTask(assigned, "", "", "none"), false)
  assert.equal(matchesTask(card, "", "", "none"), true)
  assert.equal(matchesTask(assigned, "", "", projectKey({ ...project, server: "remote" })), false)
  assert.equal(matchesTask(assigned, "missing", "ui", projectKey(project)), false)
})

test("moving a task preserves its details and appends it to the destination", () => {
  const other = { ...card, id: "two", status: "ready" }
  const result = moveCard([card, other], "one", "ready")
  assert.deepEqual(result.map((item) => item.id), ["two", "one"])
  assert.deepEqual(result[1], { ...card, status: "ready" })
  assert.equal(card.status, "backlog")
})

test("same-column and unknown-card drops leave ordering intact", () => {
  assert.deepEqual(moveCard([card], "one", "backlog"), [card])
  assert.deepEqual(moveCard([card], "missing", "done"), [card])
  assert.equal(columns.length, 5)
})

test("task prompts contain only the title and description", () => {
  assert.equal(taskPrompt(card), "Build board\n\nKeep tasks per workspace")
  assert.equal(taskPrompt({ ...card, description: "" }), "Build board")
})

test("cards can be reordered within a column in either direction", () => {
  const second = { ...card, id: "two" }
  const third = { ...card, id: "three" }
  const cards = [card, second, third]
  assert.deepEqual(moveCard(cards, "one", "backlog", 2).map((item) => item.id), ["two", "three", "one"])
  assert.deepEqual(moveCard(cards, "three", "backlog", 0).map((item) => item.id), ["three", "one", "two"])
  assert.deepEqual(cards.map((item) => item.id), ["one", "two", "three"])
})

test("cross-column drops insert at a chosen position without losing metadata", () => {
  const first = { ...card, id: "two", status: "ready" }
  const last = { ...card, id: "three", status: "ready" }
  const result = moveCard([card, first, last], "one", "ready", 1)
  assert.deepEqual(result.map((item) => item.id), ["two", "one", "three"])
  assert.deepEqual(result[1], { ...card, status: "ready" })
  assert.equal(new Set(result.map((item) => item.id)).size, 3)
})

test("empty columns and out-of-range insertion positions are supported", () => {
  assert.deepEqual(moveCard([card], "one", "done", 0), [{ ...card, status: "done" }])
  const second = { ...card, id: "two" }
  assert.deepEqual(moveCard([card, second], "one", "backlog", 99).map((item) => item.id), ["two", "one"])
  assert.deepEqual(moveCard([card, second], "two", "backlog", -1).map((item) => item.id), ["two", "one"])
})

test("dynamic boards load tasks without timestamps and view preferences round-trip", () => {
  const board = { ...initialBoard(), cards: [card] }
  assert.deepEqual(Schema.decodeUnknownSync(BoardSchema)(board), board)
  const preferences = { collapsed: ["done", "backlog"], mode: "split" }
  assert.deepEqual(Schema.decodeUnknownSync(BoardViewSchema)(preferences), preferences)
})

test("fresh boards have independent column arrays and accept custom column IDs", () => {
  const first = initialBoard()
  const second = initialBoard()
  assert.notEqual(first.columns, second.columns)
  assert.equal(first.cards.length, 0)
  const custom = { id: "custom-column", title: "Blocked", color: "var(--v2-state-fg-danger)" }
  const board = { columns: [...first.columns, custom], cards: [{ ...card, status: custom.id }] }
  assert.deepEqual(Schema.decodeUnknownSync(BoardSchema)(board), board)
})

test("column reordering works both ways without changing IDs or task assignments", () => {
  const board = initialBoard()
  const down = placeColumn(board.columns, "backlog", 3)
  assert.deepEqual(down.map((column) => column.id), ["ready", "progress", "review", "backlog", "done"])
  assert.deepEqual(placeColumn(down, "backlog", 0).map((column) => column.id), board.columns.map((column) => column.id))
  assert.deepEqual(placeColumn(board.columns, "missing", 1), board.columns)
  assert.equal(card.status, "backlog")
})

test("column drag previews reserve exactly one slot without persisting intermediate order", () => {
  const saved = initialBoard().columns
  const preview = placeColumn(saved, "backlog", 3)
  assert.deepEqual(preview.map((column) => column.id), ["ready", "progress", "review", "backlog", "done"])
  assert.equal(new Set(preview.map((column) => column.id)).size, saved.length)
  assert.equal(saved[0].id, "backlog")
  assert.deepEqual(placeColumn(saved, "backlog", 0), saved)
  assert.equal(placeColumn(saved, "backlog", 999).at(-1).id, "backlog")
  assert.equal(placeColumn(saved, "done", -1)[0].id, "done")
})

test("deleting a populated column moves every task without losing its metadata", () => {
  const board = { ...initialBoard(), cards: [card, { ...card, id: "two", status: "ready" }] }
  const result = deleteColumn(board, "backlog", "ready")
  assert.equal(result.columns.some((column) => column.id === "backlog"), false)
  assert.equal(result.cards.length, 2)
  assert.deepEqual(result.cards[0], { ...card, status: "ready" })
  assert.equal(board.cards[0].status, "backlog")
})

test("column deletion rejects orphaning tasks or deleting the last column", () => {
  const board = { ...initialBoard(), cards: [card] }
  assert.equal(deleteColumn(board, "backlog"), board)
  assert.equal(deleteColumn(board, "backlog", "backlog"), board)
  assert.equal(deleteColumn(board, "backlog", "missing"), board)
  const only = { columns: [board.columns[0]], cards: [] }
  assert.equal(deleteColumn(only, "backlog"), only)
  assert.equal(deleteColumn(board, "done").columns.length, 4)
})

test("label filters match complete labels and combine with case-insensitive search", () => {
  assert.deepEqual(taskLabels(" ui, desktop, ui, ,bug "), ["ui", "desktop", "bug"])
  assert.equal(matchesTask(card, "  BUILD  ", "desktop"), true)
  assert.equal(matchesTask(card, "", "desk"), false)
  assert.equal(matchesTask(card, "missing", "desktop"), false)
})

test("detail resizing keeps the board usable and clamps to the current panel width", () => {
  assert.deepEqual(detailWidthBounds(1000, "split"), { min: 280, max: 768 })
  assert.equal(clampDetailWidth(2000, 1000, "split"), 768)
  assert.equal(clampDetailWidth(100, 1000, "overlay"), 280)
  assert.equal(clampDetailWidth(460, 320, "overlay"), 296)
  assert.equal(clampDetailWidth(460, 200, "overlay"), 176)
  assert.equal(clampDetailWidth(460, 0, "overlay"), 0)
  assert.equal(clampDetailWidth(NaN, 1000, "split"), 380)
})

test("split and overlay widths can be persisted independently without breaking old preferences", () => {
  const settings = { collapsed: [], mode: "overlay", splitWidth: 420, overlayWidth: 560 }
  assert.deepEqual(Schema.decodeUnknownSync(BoardViewSchema)(settings), settings)
  assert.deepEqual(Schema.decodeUnknownSync(BoardViewSchema)({ collapsed: [], mode: "split" }), { collapsed: [], mode: "split" })
})
