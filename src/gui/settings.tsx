import { Schema } from "effect"
import { usePlugin, type Context } from "@opencode/plugin/gui"

export const SettingsSchema = Schema.Struct({ toolsEnabled: Schema.Boolean })

export function boardSettings(ctx: Pick<Context, "storage">) {
  return ctx.storage.store("settings-v1", { schema: SettingsSchema, initial: { toolsEnabled: true }, scope: "global" })
}
export type SettingsStore = ReturnType<typeof boardSettings>

export function BoardSettings(props: { settings: SettingsStore }) {
  const ui = usePlugin().ui
  return <>
    <div class="settings-tab-header">
      <div class="settings-tab-header-row">
        <div class="flex flex-col gap-1">
          <h2 class="settings-tab-title">OpenCode Board</h2>
          <span class="text-11-regular text-v2-text-text-muted">Manage how agents interact with your task board.</span>
        </div>
      </div>
    </div>
    <div class="settings-tab-body settings-tab-body--sectioned">
      <section class="settings-section" aria-label="Agent tools">
        <div data-component="settings-list">
          <div data-component="settings-row" data-action="tools">
            <div data-slot="settings-row-copy">
              <div data-slot="settings-row-title">Enable agent tools</div>
              <div data-slot="settings-row-description">Allow agents to read and manage tasks. Turning this off leaves the board available for manual use.</div>
            </div>
            <div data-slot="settings-row-control">
              <ui.Switch label="Enable agent tools" hideLabel
                checked={props.settings.value?.toolsEnabled ?? true} disabled={!props.settings.ready()}
                onChange={(toolsEnabled) => props.settings.update((draft) => { draft.toolsEnabled = toolsEnabled })} />
            </div>
          </div>
        </div>
      </section>
    </div>
  </>
}
