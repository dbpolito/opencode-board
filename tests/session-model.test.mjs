import { test } from "node:test"
import assert from "node:assert/strict"
import { sessionOrigin } from "../src/session-model.ts"

test("session origin keeps the calling session's provider, model, and variant instead of resolving a default", async () => {
  const model = { providerID: "openai", id: "chosen-model", variant: "high" }
  const origin = await sessionOrigin({
    async get(input) { assert.equal(input.sessionID, "caller"); return { location: { directory: "/caller" }, model } },
    async context() { throw new Error("Should not read history when a model is selected") },
  }, "caller")
  assert.deepEqual(origin, { directory: "/caller", model })
})

test("session origin falls back to the latest assistant model for older sessions", async () => {
  const origin = await sessionOrigin({
    async get() { return { location: { directory: "/caller" } } },
    async context() { return [{ type: "assistant", model: { providerID: "old", id: "old-model" } }, { type: "assistant", model: { providerID: "openai", id: "latest" } }, { type: "idle" }] },
  }, "caller")
  assert.deepEqual(origin.model, { providerID: "openai", id: "latest" })
  assert.equal(Object.hasOwn(origin.model, "variant"), false)
  assert.equal(JSON.stringify(origin).includes("undefined"), false)
})

test("session origin fails clearly without a selected or historical model", async () => {
  await assert.rejects(sessionOrigin({ async get() { return { location: { directory: "/caller" } } }, async context() { return [] } }, "caller"), /Select a model/)
})
