import { test } from "node:test"
import assert from "node:assert/strict"
import { currentTaskProject, openTaskProjects } from "../src/gui/task-projects.ts"
import { projectTitle } from "../src/gui/kanban-model.ts"

test("project choices include only open sessions, not historical server projects", () => {
  const current = { server: { id: "sidecar" }, directory: "/current", project: { worktree: "/current", name: "Current" }, listedProject: { name: "My Project" } }
  let sessions = [
    { server: { id: "sidecar" }, location: { directory: "/current" } },
    { server: { id: "remote" }, location: { directory: "/open/src" } },
    { server: { id: "remote" }, location: { directory: "/open" } },
    { server: { id: "remote" }, location: undefined },
  ]
  const ctx = {
    sessions: { list: () => sessions },
    servers: { get: () => ({ data: { project: { list: () => [
      { canonical: "/current", sandboxes: [] },
       { canonical: "/open", name: "Open Project", sandboxes: [] },
      { canonical: "/old-closed", sandboxes: [] },
    ] } } }) },
  }
  assert.deepEqual(openTaskProjects(ctx, current), [{ server: "sidecar", directory: "/current", name: "My Project" }, { server: "remote", directory: "/open", name: "Open Project" }])
  sessions = []
  assert.deepEqual(openTaskProjects(ctx, current), [{ server: "sidecar", directory: "/current", name: "My Project" }])
})

test("global project metadata does not turn an opened folder into a slash project or duplicate it", () => {
  const current = { server: { id: "sidecar" }, directory: "/code/opencode-plugin", project: { id: "global", worktree: "/" }, listedProject: { worktree: "/code/opencode-plugin", name: "Plugin" }, local: false }
  const ctx = {
    sessions: { list: () => [
      { server: current.server, location: { directory: "/" } },
      { server: current.server, location: { directory: current.directory } },
    ] },
    servers: { get: () => ({ data: { project: { list: () => [{ id: "global", canonical: "/", sandboxes: [] }] } } }) },
  }
  assert.deepEqual(openTaskProjects(ctx, current), [{ server: "sidecar", directory: "/code/opencode-plugin", name: "Plugin" }])
  assert.equal(currentTaskProject({ ...current, listedProject: undefined }).directory, current.directory)
})

test("worktree-only tabs do not add project choices", () => {
  const current = { server: { id: "sidecar" }, directory: "/worktree", project: { worktree: "/repo" } }
  const ctx = {
    sessions: { list: () => [
      { server: { id: "sidecar" }, location: { directory: "/worktree" } },
      { server: { id: "remote" }, location: { directory: "/repo" } },
    ] },
    servers: { get: () => ({ data: { project: { list: () => [{ canonical: "/repo", sandboxes: ["/worktree"] }] } } }) },
  }
  assert.deepEqual(openTaskProjects(ctx, current), [{ server: "remote", directory: "/repo", name: undefined }])
})

test("project labels prefer display names, with folder names as the fallback", () => {
  assert.equal(projectTitle({ server: "sidecar", directory: "/code/internal-name", name: "Friendly Name" }), "Friendly Name")
  assert.equal(projectTitle({ server: "sidecar", directory: "/code/internal-name" }), "internal-name")
})
