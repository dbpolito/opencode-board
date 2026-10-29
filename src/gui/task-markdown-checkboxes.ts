import { checklistItems, markdownExcerpt } from "./task-markdown.ts"

export function bindChecklistInputs(source: string, inputs: readonly HTMLInputElement[]) {
  const items = checklistItems(source)
  const bindings = new WeakMap<HTMLInputElement, { source: string; index: number }>()
  // A mismatch can mean stale rendered HTML or an input that did not come from a Markdown task.
  const matches = inputs.length === items.length && inputs.every((input, index) => input.checked === items[index].checked)
  for (const [index, input] of inputs.entries()) {
    if (input.disabled !== !matches) input.disabled = !matches
    if (!matches) continue
    bindings.set(input, { source, index })
    input.setAttribute("aria-label", markdownExcerpt(items[index].text, Infinity) || `Checklist item ${index + 1}`)
  }
  return bindings
}
