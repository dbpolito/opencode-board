import { test } from "node:test"
import assert from "node:assert/strict"
import { applyBoardRequest, toolSchemas } from "../src/board-tools.ts"
import { initialBoard, BoardSchema } from "../src/gui/kanban-model.ts"
import { Schema } from "effect"

const card = (id, status = "backlog") => ({ id, status, title: `Task ${id}`, description: "- [ ] item", labels: "bug, ui", session: "", updatedAt: 1 })
const run = (board, operation, input = {}, server = "sidecar") => applyBoardRequest(board, { operation, input, sessionID: "session-one" }, server)
const ids = (board, status) => board.cards.filter((card) => card.status === status).map((card) => card.id)

test("tool set includes task removal but no separate checklist or column management", () => {
  assert.deepEqual(Object.keys(toolSchemas), ["list", "get", "create", "update", "move", "link_session", "start_session", "remove", "wait"])
})

test("list combines filters and returns column/priority order without full descriptions", () => {
  const board = { ...initialBoard(), cards: [card("other", "done"), card("first"), { ...card("second"), project: { server: "sidecar", directory: "/repo" } }] }
  assert.deepEqual(run(board, "list").result.tasks.map((task) => task.id), ["first", "second", "other"])
  const result = run(board, "list", { query: "SECOND", column_id: "backlog", label: "ui", project_directory: "/repo" }).result
  assert.deepEqual(result.tasks.map((task) => task.id), ["second"])
  assert.equal(result.tasks[0].position, 1)
  assert.equal("description" in result.tasks[0], false)
  assert.equal(run(board, "list", { project_directory: "" }).result.tasks.length, 2)
  assert.equal(run(board, "list", { label: "u" }).result.tasks.length, 0)
  assert.throws(() => run(board, "list", { column_id: "missing" }), /Unknown column/)
})

test("create uses defaults, validates fields, and round-trips through persistence", () => {
  const original = initialBoard()
  const { board, result } = run(original, "create", { title: "  Fix bug  ", project: { server: "remote", directory: "/repo" } })
  assert.equal(original.cards.length, 0)
  assert.equal(result.title, "Fix bug")
  assert.equal(result.status, "backlog")
  assert.equal(result.position, 0)
  assert.equal("position" in board.cards[0], false)
  assert.equal(result.session, "")
  const encoded = Schema.encodeSync(BoardSchema)(board)
  assert.equal(Schema.decodeUnknownSync(BoardSchema)(JSON.parse(JSON.stringify(encoded))).cards.length, 1)
  assert.throws(() => run(original, "create", { title: " " }), /Invalid title/)
  assert.throws(() => run(original, "create", { title: "ok", column_id: "nope" }), /Unknown column/)
  assert.throws(() => run(original, "create", { title: "ok", project: { directory: "/repo" } }), /Invalid server/)
})

test("get returns Markdown, update changes supplied fields only, and stale writes fail atomically", () => {
  const original = { ...initialBoard(), cards: [card("a")] }
  assert.equal(run(original, "get", { task_id: "a" }).result.description, "- [ ] item")
  const { board, result } = run(original, "update", { task_id: "a", description: "- [x] item", expected_updated_at: 1 })
  assert.equal(result.description, "- [x] item")
  assert.equal(result.title, "Task a")
  assert.equal(result.status, "backlog")
  assert.ok(result.updatedAt > 1)
  assert.equal(original.cards[0].description, "- [ ] item")
  assert.throws(() => run(board, "update", { task_id: "a", title: "lost update", expected_updated_at: 1 }), /Task changed/)
  assert.throws(() => run(board, "update", { task_id: "a", title: "valid", description: 1 }), /Invalid description/)
  assert.equal(board.cards[0].title, "Task a")
  assert.throws(() => run(board, "get", { task_id: "missing" }), /Unknown task/)
})

test("move uses zero-based final positions, shifts other cards, and appends when omitted or past the end", () => {
  const original = { ...initialBoard(), cards: [card("a"), card("b"), card("c"), card("d", "done")] }
  let board = run(original, "move", { task_id: "c", position: 0 }).board
  assert.deepEqual(ids(board, "backlog"), ["c", "a", "b"])
  board = run(board, "move", { task_id: "c", position: 1 }).board
  assert.deepEqual(ids(board, "backlog"), ["a", "c", "b"])
  board = run(board, "move", { task_id: "a" }).board
  assert.deepEqual(ids(board, "backlog"), ["c", "b", "a"])
  board = run(board, "move", { task_id: "b", column_id: "done", position: 0 }).board
  assert.deepEqual(ids(board, "done"), ["b", "d"])
  assert.equal(board.cards.find((task) => task.id === "b").description, "- [ ] item")
  assert.equal(run(board, "get", { task_id: "b" }).result.position, 0)
  board = run(board, "move", { task_id: "b", position: 99 }).board
  assert.deepEqual(ids(board, "done"), ["d", "b"])
  board = run(board, "move", { task_id: "b", column_id: "ready" }).board
  assert.deepEqual(ids(board, "ready"), ["b"])
  assert.deepEqual(ids(original, "backlog"), ["a", "b", "c"])
  for (const position of [-1, 0.5, "0", NaN, Infinity]) assert.throws(() => run(board, "move", { task_id: "a", position }), /position/)
  assert.throws(() => run(board, "move", { task_id: "a", column_id: "missing" }), /Unknown column/)
})

test("session link/unlink is idempotent and preserves same-ID links on other servers", () => {
  const original = { ...initialBoard(), cards: [{ ...card("a"), session: "old", project: { server: "remote", directory: "/repo" }, links: [{ server: "remote", id: "session-one" }] }] }
  let board = run(original, "link_session", { task_id: "a" }).board
  board = run(board, "link_session", { task_id: "a" }).board
  assert.equal(board.cards[0].links.length, 3)
  board = run(board, "link_session", { task_id: "a", unlink: true }).board
  assert.deepEqual(board.cards[0].links, [{ server: "remote", id: "session-one" }, { server: "remote", id: "old" }])
  board = run(board, "update", { task_id: "a", project: null }).board
  assert.equal(board.cards[0].project, undefined)
  assert.equal(board.cards[0].links[1].server, "remote")
})

test("unlink targets a specific session/server without disturbing other links, including legacy links", () => {
  const original = { ...initialBoard(), cards: [{ ...card("a"), session: "legacy", links: [{ id: "target", server: "remote" }, { id: "target", server: "sidecar" }] }] }
  const input = { task_id: "a", unlink: true, session_id: "target", server: "remote" }
  let board = run(original, "link_session", input).board
  assert.deepEqual(board.cards[0].links, [{ id: "target", server: "sidecar" }, { id: "legacy", server: "sidecar" }])
  board = run(board, "link_session", input).board
  assert.equal(board.cards[0].links.length, 2)
  board = run(board, "link_session", { task_id: "a", unlink: true, session_id: "legacy" }).board
  assert.deepEqual(board.cards[0].links, [{ id: "target", server: "sidecar" }])
  assert.equal(original.cards[0].links.length, 2)
  assert.equal(original.cards[0].session, "legacy")
  for (const bad of [{ session_id: "" }, { server: "" }, { session_id: 5 }, { server: null }]) assert.throws(() => run(board, "link_session", { ...input, ...bad }), /Invalid/)
})

test("remove deletes only the selected task and its links, leaving columns and other tasks unchanged", () => {
  const original = { ...initialBoard(), cards: [card("first"), { ...card("remove"), links: [{ id: "keep-session", server: "remote" }], session: "legacy-session" }, card("last")] }
  const { board, result } = run(original, "remove", { task_id: "remove" })
  assert.deepEqual(result, { task_id: "remove", removed: true })
  assert.deepEqual(ids(board, "backlog"), ["first", "last"])
  assert.equal(run(board, "get", { task_id: "last" }).result.position, 1)
  assert.deepEqual(board.columns, original.columns)
  assert.equal(original.cards.length, 3)
  assert.equal(original.cards[1].links[0].id, "keep-session")
  assert.throws(() => run(board, "remove", { task_id: "remove" }), /Unknown task/)
  assert.throws(() => run(board, "remove", { task_id: "" }), /Invalid task_id/)
})
