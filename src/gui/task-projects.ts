import type { Context, MountedSession } from "@opencode/plugin/gui"
import { projectKey, projectTitle, type TaskProject } from "./kanban-model.ts"

export function currentTaskProject(current: MountedSession): TaskProject {
  const listed = current.listedProject?.worktree === "/" ? undefined : current.listedProject
  const project = current.project?.id === "global" || current.project?.worktree === "/" ? undefined : current.project
  return { server: current.server.id, directory: listed?.worktree ?? project?.worktree ?? current.directory, name: listed?.name ?? project?.name }
}

export function openTaskProjects(ctx: Pick<Context, "sessions" | "servers">, current: MountedSession): TaskProject[] {
  const projects = new Map<string, TaskProject>()
  for (const session of ctx.sessions.list()) {
    const directory = session.location?.directory
    if (!directory || directory === "/") continue
    const known = ctx.servers.get(session.server.id)?.data.project.list() ?? []
    if (known.some((project) => project.sandboxes.includes(directory))) continue
    const project = known.find((project) => project.id !== "global" && project.canonical !== "/" && directory === project.canonical)
    if (!project) continue
    const item = { server: session.server.id, directory: project.canonical, name: project.name }
    projects.set(projectKey(item), item)
  }
  // The mounted project includes the user's local display-name override.
  const item = currentTaskProject(current)
  if (item.directory !== "/" && current.directory === item.directory) {
    projects.set(projectKey(item), item)
  }
  return [...projects.values()]
    .sort((a, b) => projectTitle(a).localeCompare(projectTitle(b)))
}
