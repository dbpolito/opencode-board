import { createEffect, onCleanup, onMount } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { toggleChecklistItem } from "./task-markdown"
import { bindChecklistInputs } from "./task-markdown-checkboxes"

export function TaskMarkdown(props: { text: string; update(text: string): void }) {
  const ui = usePlugin().ui
  let root!: HTMLDivElement
  let bindings = new WeakMap<HTMLInputElement, { source: string; index: number }>()

  const sync = () => {
    const source = props.text
    const inputs = [...root.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')]
    // Only enable lists that map exactly to parsed Markdown, never arbitrary HTML inputs.
    bindings = bindChecklistInputs(source, inputs)
  }

  createEffect(() => {
    props.text
    bindings = new WeakMap()
    // The host renders Markdown asynchronously; the observer handles the resulting DOM.
    queueMicrotask(() => { if (root?.isConnected) sync() })
  })
  onMount(() => {
    const observer = new MutationObserver(sync)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["checked", "disabled"] })
    sync()
    onCleanup(() => observer.disconnect())
  })

  return <div ref={root} class="sc-task-markdown" onChange={(event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const binding = bindings.get(input)
    if (!binding || binding.source !== props.text) { sync(); return }
    props.update(toggleChecklistItem(binding.source, binding.index))
  }}><ui.Markdown text={props.text} /></div>
}
