import { test } from "node:test"
import assert from "node:assert/strict"
import { checklistItems, markdownExcerpt, toggleChecklistItem } from "../src/gui/task-markdown.ts"

test("card excerpts show readable Markdown rather than source formatting", () => {
  assert.equal(markdownExcerpt("# Heading\n\nA **useful** [link](https://example.com)."), "Heading A useful link.")
  assert.equal(markdownExcerpt("<script>alert('no')</script>\n\nVisible text"), "Visible text")
  assert.ok(markdownExcerpt("a".repeat(160)).endsWith("…"))
})

test("checklists track completion and toggle only the selected Markdown marker", () => {
  const text = "- [ ] First\n- [x] Second\n"
  assert.deepEqual(checklistItems(text).map(({ checked, text }) => ({ checked, text })), [{ checked: false, text: "First" }, { checked: true, text: "Second" }])
  assert.equal(toggleChecklistItem(text, 0), "- [x] First\n- [x] Second\n")
  assert.equal(toggleChecklistItem(text, 1), "- [ ] First\n- [ ] Second\n")
  assert.equal(toggleChecklistItem(text, 99), text)
})

test("checklist parsing ignores fenced code and preserves Windows line endings", () => {
  const text = "```md\r\n- [ ] Not a task\r\n```\r\n\r\n- [ ] Real task\r\n"
  assert.equal(checklistItems(text).length, 1)
  assert.equal(toggleChecklistItem(text, 0), text.replace("[ ] Real", "[x] Real"))
})

test("task-list syntax inside raw HTML is not exposed as an interactive checklist", () => {
  assert.deepEqual(checklistItems("<div>\n- [ ] Not a task\n</div>"), [])
})
