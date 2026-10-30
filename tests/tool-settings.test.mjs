import { test } from "node:test"
import assert from "node:assert/strict"
import { toolSettings } from "../src/tool-settings.ts"

function storage(initial) {
  let value = initial
  return { async get(key) { assert.equal(key, "tools-enabled"); return value }, async set(key, next) { assert.equal(key, "tools-enabled"); value = next }, read: () => value }
}

test("agent tools default to enabled and remember explicit disabling after a server reload", async () => {
  const saved = storage(undefined)
  const settings = toolSettings()
  await settings.load(saved)
  assert.equal(settings.enabled, true)
  await settings.set(false, saved)
  assert.equal(settings.enabled, false)
  const reloaded = toolSettings()
  await reloaded.load(saved)
  assert.equal(reloaded.enabled, false)
})

test("toggles refresh every location, avoid heartbeat reloads, and unsubscribe on plugin cleanup", async () => {
  const saved = storage(true)
  const settings = toolSettings()
  let one = 0, two = 0
  await settings.load(saved)
  const unsubscribe = settings.subscribe(async () => { one++ })
  settings.subscribe(async () => { two++ })
  await settings.set(false, saved)
  await settings.set(false, saved)
  assert.deepEqual([one, two], [1, 1])
  unsubscribe()
  await settings.set(true, saved)
  assert.deepEqual([one, two], [1, 2])
})

test("rapid toggles are serialized and failed registry refreshes retry on the next heartbeat", async () => {
  const saved = storage(true)
  const settings = toolSettings()
  await settings.load(saved)
  let fail = true
  let reloads = 0
  settings.subscribe(async () => { reloads++; if (fail) throw new Error("Reload failed") })
  await assert.rejects(settings.set(false, saved), /Reload failed/)
  assert.equal(settings.enabled, false)
  fail = false
  await settings.set(false, saved)
  assert.equal(reloads, 2)
  await Promise.all([settings.set(true, saved), settings.set(false, saved), settings.set(true, saved)])
  assert.equal(settings.enabled, true)
  assert.equal(saved.read(), true)
})
