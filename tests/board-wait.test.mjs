import { test } from "node:test"
import assert from "node:assert/strict"
import { waitForTask } from "../src/gui/board-wait.ts"

const task = { id: "task", session: "", links: [{ id: "a", server: "sidecar" }, { id: "b", server: "remote" }, { id: "caller", server: "sidecar" }] }
const request = (input = {}) => ({ operation: "wait", input, sessionID: "caller" })
const success = [{ type: "assistant", content: [{ type: "text", text: "Hi!" }] }, { type: "idle", outcome: "succeeded" }]
function host(messages = {}, wait = async () => {}) {
  const calls = []
  return { calls, servers: { get(server) { return { connected: true, client: { session: {
    async wait({ sessionID }, { signal }) { calls.push({ server, sessionID }); await wait(sessionID, signal) },
    async context({ sessionID }) { return messages[sessionID] ?? success },
  } } } } } }
}

test("wait handles already-idle sessions across servers, returns outcomes, and excludes the caller", async () => {
  const ctx = host({ b: [{ type: "idle", outcome: "failed" }] })
  const result = await waitForTask(ctx, task, request(), "sidecar", new AbortController().signal)
  assert.deepEqual(ctx.calls, [{ server: "sidecar", sessionID: "a" }, { server: "remote", sessionID: "b" }])
  assert.deepEqual(result.sessions.map((item) => item.outcome), ["succeeded", "failed"])
  assert.equal(result.sessions[0].text, "Hi!")
  assert.equal(result.all_succeeded, false)
  assert.equal(result.timed_out, false)
})

test("wait can target one linked session, and rejects unlinked sessions or waiting on itself", async () => {
  const ctx = host()
  const result = await waitForTask(ctx, task, request({ session_id: "b", server: "remote" }), "sidecar", new AbortController().signal)
  assert.equal(result.all_succeeded, true)
  assert.equal(result.sessions.length, 1)
  for (const input of [{ session_id: "missing" }, { session_id: "caller" }, { server: "remote" }, { timeout_seconds: 0 }, { timeout_seconds: 1.5 }]) {
    await assert.rejects(waitForTask(ctx, task, request(input), "sidecar", new AbortController().signal))
  }
})

test("wait reports interruption, unavailable servers, and unknown outcomes without assuming success", async () => {
  const ctx = host({ a: [{ type: "idle", outcome: "interrupted" }], b: [] })
  const result = await waitForTask(ctx, task, request(), "sidecar", new AbortController().signal)
  assert.deepEqual(result.sessions.map((item) => item.outcome), ["interrupted", "unknown"])
  assert.equal(result.all_succeeded, false)
  const offline = await waitForTask({ servers: { get: () => ({ connected: false }) } }, task, request(), "sidecar", new AbortController().signal)
  assert.ok(offline.sessions.every((item) => item.outcome === "unavailable"))
})

test("failed sessions expose provider errors and model without returning raw response bodies", async () => {
  const error = { type: "provider.auth", message: "Provider request failed with HTTP 403", status: 403, response: { body: "Sensitive provider response" } }
  const model = { providerID: "github-copilot", id: "example-model" }
  const ctx = host({ a: [{ type: "assistant", model, content: [], error }, { type: "idle", outcome: "failed", error }] })
  const result = await waitForTask(ctx, task, request({ session_id: "a" }), "sidecar", new AbortController().signal)
  assert.deepEqual(result.sessions[0].error, { type: "provider.auth", message: "Provider request failed with HTTP 403", status: 403 })
  assert.deepEqual(result.sessions[0].model, model)
  assert.ok(!JSON.stringify(result).includes("Sensitive"))
})

test("wait falls back to assistant error details but does not attach stale errors to successful runs", async () => {
  const error = { type: "provider.auth", message: "Access denied" }
  const ctx = host({ a: [{ type: "assistant", content: [], error }, { type: "idle", outcome: "failed" }], b: [{ type: "assistant", content: [], error }, { type: "idle", outcome: "succeeded" }] })
  const result = await waitForTask(ctx, task, request(), "sidecar", new AbortController().signal)
  assert.deepEqual(result.sessions[0].error, error)
  assert.equal(Object.hasOwn(result.sessions[0].error, "status"), false)
  assert.equal(Object.hasOwn(result.sessions[1], "error"), false)
})

const pending = (_id, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))

test("timeout aborts native wait requests but preserves outcomes that already finished", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const ctx = host({}, (id, signal) => id === "b" ? pending(id, signal) : Promise.resolve())
  const waiting = waitForTask(ctx, task, request({ timeout_seconds: 1 }), "sidecar", new AbortController().signal)
  await new Promise(setImmediate)
  t.mock.timers.tick(1000)
  const result = await waiting
  assert.equal(result.timed_out, true)
  assert.deepEqual(result.sessions.map((item) => item.outcome), ["succeeded", "timed_out"])
})

test("cancellation aborts native requests without stopping the linked sessions", async () => {
  const controller = new AbortController()
  const waiting = waitForTask(host({}, pending), task, request(), "sidecar", controller.signal)
  const rejected = assert.rejects(waiting, /Cancelled by caller/)
  controller.abort(new Error("Cancelled by caller"))
  await rejected
})
