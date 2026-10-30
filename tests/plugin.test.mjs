// Bundle contract tests; Desktop rendering and pointer interactions are checked manually.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import * as gui from "@opencode/plugin/gui"
import * as rpc from "@opencode/plugin/rpc"
import { webcrypto } from "node:crypto"
import * as solid from "solid-js"
import * as effect from "effect"
import serverPlugin from "../dist/server.js"
import { BoardBridge } from "../dist/rpc.js"

const id = "opencode-board"
const sourceModel = { id: "test-model", providerID: "openai", variant: "high" }
const savedSettings = new Map()
const serverStorage = { async get(key) { return savedSettings.get(key) }, async set(key, value) { savedSettings.set(key, value) } }

// Match OpenCode's JSON-schema RPC validation and HTTP JSON boundary, not just
// direct handler calls (which incorrectly allow explicit undefined fields).
function rpcTransport(definition, handlers) {
  const codec = (schema) => effect.Schema.make(effect.SchemaRepresentation.fromJsonSchemaDocument(effect.JsonSchema.fromSchemaDraft2020_12(schema)).ast)
  return Object.fromEntries(Object.entries(definition.methods).map(([name, method]) => {
    const input = codec(method.input)
    const output = codec(method.output)
    return [name, async (value) => {
      const parsed = effect.Schema.decodeUnknownSync(input)(JSON.parse(JSON.stringify(value)))
      const result = effect.Schema.decodeUnknownSync(output)(await handlers[name](parsed))
      return JSON.parse(JSON.stringify(result))
    }]
  }))
}

test("poll output rejects explicit undefined rather than delivering a non-JSON request", async () => {
  const request = { operation: "list", input: {}, sessionID: "calling-session" }
  const bridge = rpcTransport(BoardBridge, { poll: async () => ({ id: "request-id", request: { ...request, directory: undefined } }) })
  await assert.rejects(bridge.poll({ clientID: "window" }), /directory/)
  const valid = rpcTransport(BoardBridge, { poll: async () => ({ id: "request-id", request }) })
  assert.deepEqual((await valid.poll({ clientID: "window" })).request, request)
})

test("bridge reports RPC failures once until recovery, including plain-object SDK errors", async () => {
  let failing = true
  const host = windowHost({ async poll() { if (failing) throw { type: "rpc.invalid_output", message: "Expected JSON value" }; return null } })
  host.tick()
  await new Promise(setImmediate)
  assert.equal(host.logs.length, 1)
  assert.equal(host.logs[0][1].stage, "poll")
  assert.equal(host.logs[0][1].error, "Expected JSON value")
  host.timers.shift()()
  await new Promise(setImmediate)
  assert.equal(host.logs.length, 1)
  failing = false
  host.timers.shift()()
  await new Promise(setImmediate)
  failing = true
  host.timers.shift()()
  await new Promise(setImmediate)
  assert.equal(host.logs.length, 2)
})

test("server tools round-trip through JSON RPC validation, the built GUI bridge, and the existing shared store", async () => {
  const tools = new Map()
  const permissions = []
  const sessionReads = []
  let bridge
  let transform
  const editor = { add(tool) { tools.set(tool.name, tool) } }
  const cleanup = await serverPlugin.setup({
    storage: serverStorage,
    rpc: { async register(contract, implementation) { bridge = rpcTransport(contract, implementation) } },
    permission: { async assert(input) { permissions.push(input) } },
    session: { async get(input) { sessionReads.push(input); return { location: { directory: "/calling-project" }, model: sourceModel } } },
    tool: { async transform(edit) { transform = edit; edit(editor) }, async reload() { tools.clear(); transform(editor) } },
  })
  assert.deepEqual([...tools.keys()], ["board_list", "board_get", "board_create", "board_update", "board_move", "board_link_session", "board_start_session", "board_remove", "board_wait"])
  let releaseWait
  let slowWait = false
  const host = windowHost(bridge, {
    async wait() { if (slowWait) await new Promise((resolve) => { releaseWait = resolve }) },
    async context() { return [{ type: "idle", outcome: "succeeded" }] },
  })
  const board = host.list(gui.Panel)[0].render({ session: host.session }).props.board
  const header = host.list(gui.Slot)[0].render({ session: host.session })
  host.tick()
  await new Promise(setImmediate)
  const context = { sessionID: "calling-session", agent: "build", messageID: "message", id: "call", signal: new AbortController().signal }
  const call = async (name, input) => {
    const result = tools.get(name).execute(input, context)
    await new Promise(setImmediate)
    assert.ok(host.timers.length)
    host.timers.shift()()
    return JSON.parse((await result).content)
  }
  const created = await call("board_create", { title: "From conversation", description: "- [ ] verify" })
  assert.equal(board.value.cards[0].id, created.id)
  assert.equal(header.props.board.value.cards.length, 1)
  assert.equal(host.storeCalls(), 2)
  await call("board_update", { task_id: created.id, description: "- [x] verify" })
  assert.equal(board.value.cards[0].description, "- [x] verify")
  await call("board_move", { task_id: created.id, column_id: "done" })
  await call("board_link_session", { task_id: created.id })
  const read = await call("board_get", { task_id: created.id })
  assert.equal(read.status, "done")
  assert.deepEqual(read.links, [{ id: "calling-session", server: "sidecar" }])
  assert.equal(permissions.length, 4)
  assert.equal(permissions[0].action, "board_update")
  assert.equal(host.created.length, 0)
  assert.equal(host.sent.length, 0)
  assert.equal((await call("board_list", {})).tasks.length, 1)
  const starting = call("board_start_session", { task_id: created.id })
  await new Promise(setImmediate)
  assert.equal(host.created.length, 1)
  assert.equal(host.created[0].input.location.directory, "/calling-project")
  assert.deepEqual(host.created[0].input.model, sourceModel)
  assert.deepEqual(sessionReads, [{ sessionID: "calling-session" }])
  host.created[0].resolve({ id: "from-tool" })
  const started = await starting
  assert.equal(started.session_id, "from-tool")
  assert.equal(started.server, "sidecar")
  assert.deepEqual(started.model, sourceModel)
  assert.equal(board.value.cards[0].status, "done")
  assert.ok(board.value.cards[0].links.some((link) => link.id === "from-tool"))
  assert.equal(host.sent[0].text, `Work on board task "From conversation" (task_id: ${created.id}). Mark checkboxes as you complete.\n\n- [x] verify`)
  assert.equal(host.opened.length, 0)
  assert.equal(permissions.at(-1).action, "board_start_session")
  const waited = await call("board_wait", { task_id: created.id })
  assert.equal(waited.all_succeeded, true)
  assert.equal(waited.sessions.length, 1)
  assert.equal(waited.sessions[0].id, "from-tool")
  assert.equal(permissions.at(-1).action, "board_start_session")
  slowWait = true
  const longWait = call("board_wait", { task_id: created.id, session_id: "from-tool" })
  await new Promise(setImmediate)
  assert.equal(typeof releaseWait, "function")
  assert.equal((await call("board_list", {})).tasks.length, 1)
  releaseWait()
  assert.equal((await longWait).all_succeeded, true)
  slowWait = false
  await call("board_update", { task_id: created.id, project: { server: "remote", directory: "/assigned-project" } })
  const remoteStart = call("board_start_session", { task_id: created.id, open: true })
  await new Promise(setImmediate)
  assert.equal(host.created[1].server, "remote")
  assert.equal(host.created[1].input.location.directory, "/assigned-project")
  assert.deepEqual(host.created[1].input.model, sourceModel)
  host.created[1].resolve({ id: "remote-created" })
  assert.equal((await remoteStart).server, "remote")
  assert.equal(host.opened.length, 1)
  assert.equal(host.opened[0][0].id, "remote-created")
  assert.equal(host.opened[0][1].focus, false)
  assert.ok(board.value.cards[0].links.some((link) => link.id === "remote-created" && link.server === "remote"))
  const failedStart = call("board_start_session", { task_id: created.id, open: false })
  const rejected = assert.rejects(failedStart, /Creation unavailable/)
  await new Promise(setImmediate)
  host.created[2].reject(new Error("Creation unavailable"))
  await rejected
  assert.equal(host.sent.length, 2)
  const settingsPage = host.list(gui.SettingsPage)[0]
  const settings = settingsPage.render({}).props.settings
  const captured = tools.get("board_create")
  settings.update((draft) => { draft.toolsEnabled = false })
  host.timers.shift()()
  await new Promise(setImmediate)
  assert.equal(tools.size, 0)
  assert.equal(savedSettings.get("tools-enabled"), false)
  await assert.rejects(captured.execute({ title: "Must stay disabled" }, context), /disabled in Settings/)
  assert.equal(host.list(gui.Panel).length, 1)
  settings.update((draft) => { draft.toolsEnabled = true })
  host.timers.shift()()
  await new Promise(setImmediate)
  assert.equal(tools.size, 9)
  assert.equal(savedSettings.get("tools-enabled"), true)
  assert.equal(host.opened.length, 1)
  assert.equal(board.value.cards[0].links.length, 3)
  await call("board_link_session", { task_id: created.id, unlink: true, session_id: "remote-created", server: "remote" })
  assert.equal(board.value.cards[0].links.length, 2)
  assert.ok(!board.value.cards[0].links.some((link) => link.id === "remote-created"))
  assert.equal((await call("board_remove", { task_id: created.id })).removed, true)
  assert.equal(board.value.cards.length, 0)
  assert.equal(header.props.board.value.cards.length, 0)
  assert.equal(permissions.at(-1).action, "board_remove")
  assert.equal(host.created.length, 3)
  assert.equal(host.sent.length, 2)
  cleanup()
})

test("denied write permissions never enqueue a Desktop mutation", async () => {
  const tools = new Map()
  await serverPlugin.setup({
    storage: serverStorage,
    rpc: { async register() {} },
    permission: { async assert() { throw new Error("Denied") } },
    tool: { async transform(edit) { edit({ add(tool) { tools.set(tool.name, tool) } }) } },
  })
  for (const [name, input] of [["board_create", { title: "Must not be created" }], ["board_remove", { task_id: "keep" }], ["board_link_session", { task_id: "keep", unlink: true }]]) {
    await assert.rejects(tools.get(name).execute(input, {
      sessionID: "session", agent: "build", messageID: "message", id: "call", signal: new AbortController().signal,
    }), /Denied/)
  }
})

function load(effects = [], runtime = {}) {
  const exports = {}
  const modules = {
    "@opencode/plugin/gui": gui,
    "@opencode/plugin/rpc": rpc,
    "solid-js/web": { template: () => () => {}, delegateEvents() {}, createComponent: (component, props) => ({ component, props }) },
    "solid-js": { ...solid, createEffect: (effect) => effects.push(effect), onCleanup() {}, createComponent: (component, props) => ({ component, props }) },
    effect,
  }
  runInNewContext(readFileSync(new URL("../dist/gui-experimental.cjs", import.meta.url), "utf8"), {
    exports, AbortController, crypto: webcrypto, queueMicrotask, setTimeout, clearTimeout,
    ...runtime,
    require(name) { assert.ok(name in modules, `Unexpected bundled import: ${name}`); return modules[name] },
  })
  return exports.default
}

function windowHost(bridge, sessionAPI = { async wait() {}, async context() { return [{ type: "idle", outcome: "succeeded" }] } }) {
  const effects = []
  const timers = []
  const logs = []
  const plugin = load(effects, { console: { warn: (...args) => logs.push(args) }, setTimeout(fn, delay) { if (delay === 500) timers.push(fn); return fn }, clearTimeout() {} })
  const items = new Map()
  const calls = []
  const created = []
  const opened = []
  const sent = []
  const stores = new Map()
  let storeCalls = 0
  const session = { id: "session-1", key: "sidecar\nsession-1", server: { id: "sidecar" }, directory: "/project" }
  let current = session
  const ctx = {
    id,
    sessions: { current: () => current },
    add(token, item) { const list = items.get(token.id) ?? []; list.push(item); items.set(token.id, list) },
    layout: {
      open: (...args) => calls.push(args), state: () => "closed",
      draft: () => { throw new Error("Starting must not depend on a draft tab") },
    },
    tabs: { open: (...args) => opened.push(args) },
    screen: { current: () => { throw new Error("Starting a session must not write to the composer") } },
    servers: { list: () => bridge ? ["sidecar"] : [], get: (serverID) => ({ connected: true, id: serverID, client: { rpc: () => bridge, session: { async get() { return { location: { directory: "/project" }, model: sourceModel } }, ...sessionAPI } }, data: { session: {
      create(input) {
        let resolve, reject
        const request = new Promise((yes, no) => { resolve = yes; reject = no })
        created.push({ input, resolve, reject, server: serverID })
        return { id: "created", request }
      },
      async prompt(input) { sent.push(input) },
    } } }) },
    storage: { store(key, options) {
      storeCalls++
      const scope = JSON.stringify([key, options.scope])
      // Deliberately return independent handles: the plugin must share its setup-owned store.
      const store = { value: structuredClone(options.initial), ready: () => true, update(fn) { fn(this.value) }, set(value) { this.value = value } }
      stores.set(scope, store)
      return store
    } },
    toast: { show: (input) => calls.push(input) },
  }
  plugin.setup(ctx)
  return {
    calls, session, created, opened, sent, logs, stores, timers, storeCalls: () => storeCalls, tick: () => effects.forEach((effect) => effect()), setSession: (value) => { current = value },
    list: (token) => (items.get(token.id) ?? []).map((item) => typeof item === "function" ? item() : item).filter(Boolean),
  }
}

test("registers the board, launchers, settings page, header shortcut, and styles", () => {
  const host = windowHost()
  assert.equal(host.list(gui.Command).length, 1)
  assert.equal(host.list(gui.Panel).length, 1)
  assert.equal(host.list(gui.MenuItem).length, 1)
  assert.equal(host.list(gui.Style).length, 1)
  assert.deepEqual(host.list(gui.Slot).map((slot) => slot.at), ["session.header"])
  assert.equal(host.list(gui.SettingsPage).length, 1)
  assert.equal(host.list(gui.SettingsPage)[0].title, "OpenCode Board")
  assert.equal(host.list(gui.SettingsPage)[0].render({}).props.settings.value.toolsEnabled, true)
  for (const token of [gui.TitlebarItem, gui.ComposerPill, gui.Server, gui.LinkHandler]) {
    assert.equal(host.list(token).length, 0)
  }
  assert.equal(load().main, undefined)
  assert.equal(load().stores, undefined)
})

test("settings bundle uses OpenCode's native settings header, card, and row slots", () => {
  const bundle = readFileSync(new URL("../dist/gui-experimental.cjs", import.meta.url), "utf8")
  for (const name of ["settings-tab-header", "settings-tab-title", "settings-tab-body--sectioned", "settings-list", "settings-row-copy", "settings-row-title", "settings-row-description", "settings-row-control"]) {
    assert.ok(bundle.includes(name), `Missing native settings layout: ${name}`)
  }
})

test("header count and board share one live store across changes and panel remounts", () => {
  const host = windowHost()
  const panel = host.list(gui.Panel)[0]
  const header = host.list(gui.Slot)[0].render({ session: host.session })
  const board = panel.render({ session: host.session }).props.board
  assert.equal(header.props.board, board)
  board.value.cards = Array.from({ length: 5 }, (_, id) => ({ id: String(id) }))
  host.tick()
  assert.equal(header.props.board.value.cards.length, 5)
  board.update((draft) => { draft.cards.push({ id: "new" }) })
  assert.equal(header.props.board.value.cards.length, 6)
  host.tick()
  assert.equal(header.props.board.value.cards.length, 6)
  assert.equal(panel.render({ session: host.session }).props.board, board)
  board.update((draft) => { draft.cards = [] })
  assert.equal(header.props.board.value.cards.length, 0)
  assert.equal(host.storeCalls(), 2)
})

test("board command follows the current session and is unavailable on Home", () => {
  const host = windowHost()
  const command = host.list(gui.Command)[0]
  assert.equal(command.id, "kanban")
  assert.equal(command.enabled, true)
  command.run()
  assert.equal(host.calls[0][0], `${id}:kanban`)
  assert.equal(host.calls[0][1], host.session)
  assert.equal(host.calls[0][2].tab, "select")
  const next = { ...host.session, id: "session-2" }
  host.setSession(next)
  command.run()
  assert.equal(host.calls[1][1], next)
  host.setSession(undefined)
  assert.equal(host.list(gui.Command)[0].enabled, false)
  command.run()
  assert.equal(host.calls.length, 2)
})

test("board tab identity is stable and absent until opened", () => {
  const host = windowHost()
  const panel = host.list(gui.Panel)[0]
  assert.equal(panel.list({ open: [] }).length, 0)
  const tabs = panel.list({ open: ["kanban"] })
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].id, "kanban")
  assert.equal(tabs[0], panel.list({ open: ["kanban"] })[0])
})

test("panel menu opens the board for the current session", () => {
  const host = windowHost()
  const menu = host.list(gui.MenuItem)[0]
  assert.equal(menu.menu, "session.panel")
  menu.run()
  assert.equal(host.calls[0][0], `${id}:kanban`)
  assert.equal(host.calls[0][1], host.session)
})

async function startingTask(fields = {}) {
  const host = windowHost()
  host.tick()
  const task = { id: "task", title: "Build it", description: "Acceptance criteria", labels: "", status: "backlog", session: "", ...fields }
  const panel = host.list(gui.Panel)[0].render({ session: host.session })
  const starting = panel.props.start(task)
  const board = [...host.stores.values()][0]
  board.value.cards.push(task)
  await new Promise(setImmediate)
  return { host, task, board, starting, start: () => panel.props.start(task) }
}

test("starting links the created session and sends the task directly without touching the composer", async () => {
  const { host, task, starting } = await startingTask()
  assert.equal(host.created[0].input.location.directory, "/project")
  assert.equal(host.created[0].input.model.providerID, "openai")
  assert.equal(host.created[0].input.model.id, "test-model")
  assert.equal(host.created[0].input.model.variant, "high")
  assert.equal(task.session, "")
  host.created[0].resolve({ id: "created" })
  await starting
  assert.deepEqual(Array.from(task.links, (link) => [link.server, link.id]), [["sidecar", "created"]])
  assert.equal(task.session, "")
  assert.equal(task.status, "backlog")
  assert.ok(task.updatedAt)
  assert.equal(host.opened[0][0].id, "created")
  assert.equal(host.opened[0][1].focus, true)
  assert.equal(host.sent.length, 1)
  assert.equal(host.sent[0].sessionID, "created")
  assert.equal(host.sent[0].text, 'Work on board task "Build it" (task_id: task). Mark checkboxes as you complete.\n\nAcceptance criteria')
  host.tick()
  assert.equal(host.sent.length, 1)
})

test("failed creation leaves the task unlinked and reports the error", async () => {
  const { host, task, starting } = await startingTask()
  host.created[0].reject(new Error("Server unavailable"))
  await starting
  assert.equal(task.session, "")
  assert.equal(host.opened.length, 0)
  assert.equal(host.sent.length, 0)
  assert.equal(host.calls[0].title, "Could not start session")
})

test("global tasks start on their assigned project and server, not the currently open session", async () => {
  const { host, task, starting } = await startingTask({ project: { server: "remote", directory: "/other-project" } })
  assert.equal(host.created[0].server, "remote")
  assert.equal(host.created[0].input.location.directory, "/other-project")
  host.created[0].resolve({ id: "created" })
  await starting
  assert.equal(host.opened[0][0].server, "remote")
  assert.equal(task.links[0].server, "remote")
})

test("repeated clicks do not create duplicate sessions while creation is pending", async () => {
  const { host, task, starting, start } = await startingTask()
  await start()
  assert.equal(host.created.length, 1)
  host.created[0].resolve({ id: "created" })
  await starting
  const second = start()
  await new Promise(setImmediate)
  host.created[1].resolve({ id: "created-2" })
  await second
  assert.deepEqual(Array.from(task.links, (link) => link.id), ["created", "created-2"])
})

test("starting preserves manual link changes and never executes deleted tasks", async () => {
  const { host, task, starting } = await startingTask()
  task.session = "manually-linked"
  host.created[0].resolve({ id: "created" })
  await starting
  assert.deepEqual(Array.from(task.links, (link) => link.id), ["manually-linked", "created"])
  assert.equal(host.sent.length, 1)
  const next = await startingTask()
  next.board.value.cards = []
  next.host.created[0].resolve({ id: "created" })
  await next.starting
  assert.equal(next.board.value.cards.length, 0)
  assert.equal(next.host.sent.length, 0)
})
