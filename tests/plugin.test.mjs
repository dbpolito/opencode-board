// Bundle contract tests; Desktop rendering and pointer interactions are checked manually.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import * as gui from "@opencode/plugin/gui"
import * as solid from "solid-js"
import * as effect from "effect"

const id = "opencode-desktop-showcase"

function load(effects = []) {
  const exports = {}
  const modules = {
    "@opencode/plugin/gui": gui,
    "solid-js/web": { template: () => () => {}, delegateEvents() {}, createComponent: (component, props) => ({ component, props }) },
    "solid-js": { ...solid, createEffect: (effect) => effects.push(effect), createComponent: (component, props) => ({ component, props }) },
    effect,
  }
  runInNewContext(readFileSync(new URL("../dist/gui-experimental.cjs", import.meta.url), "utf8"), {
    exports, AbortController, queueMicrotask, setTimeout, clearTimeout,
    require(name) { assert.ok(name in modules, `Unexpected bundled import: ${name}`); return modules[name] },
  })
  return exports.default
}

function windowHost() {
  const effects = []
  const plugin = load(effects)
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
    servers: { get: (serverID) => ({ connected: true, data: { session: {
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
      const store = { value: structuredClone(options.initial), ready: () => true, update(fn) { fn(this.value) } }
      stores.set(scope, store)
      return store
    } },
    toast: { show: (input) => calls.push(input) },
  }
  plugin.setup(ctx)
  return {
    calls, session, created, opened, sent, stores, storeCalls: () => storeCalls, tick: () => effects.forEach((effect) => effect()), setSession: (value) => { current = value },
    list: (token) => (items.get(token.id) ?? []).map((item) => typeof item === "function" ? item() : item).filter(Boolean),
  }
}

test("registers only the board, its launchers, header shortcut, and styles", () => {
  const host = windowHost()
  assert.equal(host.list(gui.Command).length, 1)
  assert.equal(host.list(gui.Panel).length, 1)
  assert.equal(host.list(gui.MenuItem).length, 1)
  assert.equal(host.list(gui.Style).length, 1)
  assert.deepEqual(host.list(gui.Slot).map((slot) => slot.at), ["session.header"])
  for (const token of [gui.SettingsPage, gui.TitlebarItem, gui.ComposerPill, gui.Server, gui.LinkHandler]) {
    assert.equal(host.list(token).length, 0)
  }
  assert.equal(load().main, undefined)
  assert.equal(load().stores, undefined)
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
  assert.equal(host.storeCalls(), 1)
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

function startingTask(fields = {}) {
  const host = windowHost()
  host.tick()
  const task = { id: "task", title: "Build it", description: "Acceptance criteria", labels: "", status: "backlog", session: "", ...fields }
  const panel = host.list(gui.Panel)[0].render({ session: host.session })
  const starting = panel.props.start(task)
  const board = [...host.stores.values()][0]
  board.value.cards.push(task)
  return { host, task, board, starting, start: () => panel.props.start(task) }
}

test("starting links the created session and sends the task directly without touching the composer", async () => {
  const { host, task, starting } = startingTask()
  assert.equal(host.created[0].input.location.directory, "/project")
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
  assert.equal(host.sent[0].text, "Build it\n\nAcceptance criteria")
  host.tick()
  assert.equal(host.sent.length, 1)
})

test("failed creation leaves the task unlinked and reports the error", async () => {
  const { host, task, starting } = startingTask()
  host.created[0].reject(new Error("Server unavailable"))
  await starting
  assert.equal(task.session, "")
  assert.equal(host.opened.length, 0)
  assert.equal(host.sent.length, 0)
  assert.equal(host.calls[0].title, "Could not start session")
})

test("global tasks start on their assigned project and server, not the currently open session", async () => {
  const { host, task, starting } = startingTask({ project: { server: "remote", directory: "/other-project" } })
  assert.equal(host.created[0].server, "remote")
  assert.equal(host.created[0].input.location.directory, "/other-project")
  host.created[0].resolve({ id: "created" })
  await starting
  assert.equal(host.opened[0][0].server, "remote")
  assert.equal(task.links[0].server, "remote")
})

test("repeated clicks do not create duplicate sessions while creation is pending", async () => {
  const { host, task, starting, start } = startingTask()
  await start()
  assert.equal(host.created.length, 1)
  host.created[0].resolve({ id: "created" })
  await starting
  const second = start()
  host.created[1].resolve({ id: "created-2" })
  await second
  assert.deepEqual(Array.from(task.links, (link) => link.id), ["created", "created-2"])
})

test("starting preserves manual link changes and never executes deleted tasks", async () => {
  const { host, task, starting } = startingTask()
  task.session = "manually-linked"
  host.created[0].resolve({ id: "created" })
  await starting
  assert.deepEqual(Array.from(task.links, (link) => link.id), ["manually-linked", "created"])
  assert.equal(host.sent.length, 1)
  const next = startingTask()
  next.board.value.cards = []
  next.host.created[0].resolve({ id: "created" })
  await next.starting
  assert.equal(next.board.value.cards.length, 0)
  assert.equal(next.host.sent.length, 0)
})
