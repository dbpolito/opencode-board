import { test } from "node:test"
import assert from "node:assert/strict"
import { bridgeQueue } from "../src/bridge-queue.ts"

test("tools fail clearly without Desktop instead of creating an invisible board", async () => {
  const queue = bridgeQueue()
  await assert.rejects(queue.request({}, new AbortController().signal), /Open OpenCode Desktop/)
})

test("one Desktop claims each request and other windows cannot complete or replay it", async () => {
  const queue = bridgeQueue()
  queue.poll("window-one")
  const result = queue.request({ operation: "create" }, new AbortController().signal)
  const delivery = queue.poll("window-one")
  assert.equal(delivery.request.operation, "create")
  assert.equal(queue.poll("window-two"), null)
  assert.equal(queue.poll("window-one"), null)
  queue.complete("window-two", delivery.id, "wrong")
  assert.equal(queue.poll("window-one"), null)
  queue.complete("window-one", delivery.id, { id: "created" })
  assert.deepEqual(await result, { id: "created" })
  assert.equal(queue.poll("window-one"), null)
})

test("queue serializes operations and propagates Desktop validation errors", async () => {
  const queue = bridgeQueue()
  queue.poll("one")
  const first = queue.request({ n: 1 }, new AbortController().signal)
  const second = queue.request({ n: 2 }, new AbortController().signal)
  let delivery = queue.poll("one")
  assert.equal(delivery.request.n, 1)
  queue.complete("one", delivery.id, "ok")
  assert.equal(await first, "ok")
  delivery = queue.poll("one")
  assert.equal(delivery.request.n, 2)
  const rejected = assert.rejects(second, /Unknown task/)
  queue.complete("one", delivery.id, undefined, "Unknown task")
  await rejected
})

test("cancellation before delivery removes the request; after delivery warns against blind retry", async () => {
  const queue = bridgeQueue()
  queue.poll("one")
  for (const delivered of [false, true]) {
    const controller = new AbortController()
    const result = queue.request({}, controller.signal)
    if (delivered) queue.poll("one")
    const rejected = assert.rejects(result, delivered ? /may have been applied/ : /^Error: Board request cancelled$/)
    controller.abort()
    await rejected
    assert.equal(queue.poll("one"), null)
  }
})

test("timed-out requests are never redelivered", async () => {
  const queue = bridgeQueue(10)
  queue.poll("one")
  await assert.rejects(queue.request({}, new AbortController().signal), /Desktop did not answer/)
  assert.equal(queue.poll("one"), null)
})

test("long-running waits do not block other tool deliveries and cancellation reaches Desktop", async () => {
  const queue = bridgeQueue()
  queue.poll("one")
  const controller = new AbortController()
  const waiting = queue.request({ operation: "wait" }, controller.signal, { concurrent: true })
  const delivery = queue.poll("one")
  const moved = queue.request({ operation: "move" }, new AbortController().signal)
  const mutation = queue.poll("one")
  assert.equal(mutation.request.operation, "move")
  queue.complete("one", mutation.id, "moved")
  assert.equal(await moved, "moved")
  const rejected = assert.rejects(waiting, /Board request cancelled/)
  controller.abort()
  await rejected
  assert.deepEqual(queue.poll("one"), { cancel: delivery.id })
  assert.equal(queue.poll("one"), null)
})
