import { test } from "node:test"
import assert from "node:assert/strict"
import { bindChecklistInputs } from "../src/gui/task-markdown-checkboxes.ts"
import { toggleChecklistItem } from "../src/gui/task-markdown.ts"

function checkbox(checked = false) {
  return { checked, disabled: true, attributes: {}, setAttribute(key, value) { this.attributes[key] = value } }
}

test("rendered task checkboxes become accessible controls that update only their Markdown marker", () => {
  const source = "- [ ] **First**\r\n  - [x] Nested\r\n- [ ] Last\r\n"
  const inputs = [checkbox(), checkbox(true), checkbox()]
  const bindings = bindChecklistInputs(source, inputs)
  assert.ok(inputs.every((input) => !input.disabled))
  assert.equal(inputs[0].attributes["aria-label"], "First")
  const binding = bindings.get(inputs[1])
  assert.equal(binding.source, source)
  assert.equal(toggleChecklistItem(binding.source, binding.index), source.replace("[x] Nested", "[ ] Nested"))
})

test("extra HTML checkboxes and stale rendered states stay disabled and unbound", () => {
  const extra = [checkbox(), checkbox()]
  const bindings = bindChecklistInputs("- [ ] Task", extra)
  assert.ok(extra.every((input) => input.disabled && !bindings.has(input)))
  const stale = checkbox(true)
  assert.equal(bindChecklistInputs("- [ ] Task", [stale]).has(stale), false)
  assert.equal(stale.disabled, true)
})

test("fenced code is not bound, and repeated synchronization does not rewrite disabled attributes", () => {
  const input = checkbox()
  let writes = 0
  Object.defineProperty(input, "disabled", { get: () => false, set() { writes++ } })
  bindChecklistInputs("- [ ] Task", [input])
  bindChecklistInputs("- [ ] Task", [input])
  assert.equal(writes, 0)
  const codeInput = checkbox()
  assert.equal(bindChecklistInputs("```md\n- [ ] Example\n```", [codeInput]).has(codeInput), false)
  assert.equal(codeInput.disabled, true)
})
