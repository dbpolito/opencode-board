// Adapted from the user's Kompass board: parse excerpts and checklists, never raw HTML.
// Rendering stays with OpenCode's Markdown component.
import { marked, type Token } from "marked"

export function markdownExcerpt(markdown: string, limit = 140): string {
  const parts: string[] = []
  const inline = (tokens: Token[]): string => tokens.map((token) => {
    if (token.type === "html") return ""
    if ("tokens" in token && Array.isArray(token.tokens)) return inline(token.tokens)
    return "text" in token && typeof token.text === "string" ? token.text : " "
  }).join("")
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "list") for (const item of token.items) visit(item.tokens)
      else if (token.type === "blockquote") visit(token.tokens ?? [])
      else if (["heading", "paragraph", "text"].includes(token.type) && "text" in token) {
        parts.push(inline("tokens" in token && token.tokens ? token.tokens as Token[] : marked.Lexer.lexInline(String(token.text))))
      }
    }
  }
  visit(marked.lexer(markdown))
  const text = parts.join(" ").replace(/\s+/g, " ").trim()
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

export function checklistItems(markdown: string): { offset: number; checked: boolean; text: string }[] {
  const offsets: number[] = []
  let normalized = ""
  for (let index = 0; index < markdown.length; index++) {
    if (markdown[index] === "\r") {
      if (markdown[index + 1] === "\n") index++
      normalized += "\n"
    } else normalized += markdown[index]
    offsets.push(index)
  }
  const items: { offset: number; checked: boolean; text: string }[] = []
  let cursor = 0
  for (const token of marked.lexer(normalized)) {
    const start = normalized.indexOf(token.raw, cursor)
    if (start < 0) return []
    cursor = start + token.raw.length
    if (token.type !== "list" && token.type !== "blockquote") continue
    let lineStart = 0
    let fence: { marker: string; length: number } | undefined
    for (const line of token.raw.split(/(?<=\n)/)) {
      const text = line.replace(/\n$/, "")
      const fenceMatch = /^[ \t]*(?:>[ \t]*)*(?:[-+*]|\d+[.)])?[ \t]*(`{3,}|~{3,})/.exec(text)
      if (fenceMatch) {
        const marker = fenceMatch[1][0]
        if (!fence) fence = { marker, length: fenceMatch[1].length }
        else if (marker === fence.marker && fenceMatch[1].length >= fence.length) fence = undefined
      } else if (!fence) {
        const match = /^([ \t]*(?:>[ \t]*)*(?:[-+*]|\d+[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)(.*)/.exec(text)
        if (match) items.push({ offset: offsets[start + lineStart + match[1].length + 1], checked: match[2] !== " ", text: match[3].trim() })
      }
      lineStart += line.length
    }
  }
  const parsed: boolean[] = []
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "list") for (const item of token.items) { if (item.task) parsed.push(!!item.checked); visit(item.tokens) }
      else if (token.type === "blockquote") visit(token.tokens ?? [])
    }
  }
  visit(marked.lexer(normalized))
  return parsed.length === items.length && parsed.every((checked, index) => checked === items[index].checked) ? items : []
}

export function toggleChecklistItem(markdown: string, index: number): string {
  const item = checklistItems(markdown)[index]
  return item ? markdown.slice(0, item.offset) + (item.checked ? " " : "x") + markdown.slice(item.offset + 1) : markdown
}
