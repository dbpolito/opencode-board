type Storage = { get(key: string): Promise<unknown>; set(key: string, value: boolean): Promise<void> }

// Shared by every location instance on one server. Desktop owns the preference;
// the server keeps a durable copy so disabling survives a server restart.
export function toolSettings() {
  let enabled = true
  let loaded: Promise<void> | undefined
  let pending = Promise.resolve()
  let dirty = false
  const listeners = new Set<() => Promise<void>>()
  const load = (storage: Storage) => loaded ??= storage.get("tools-enabled").then((value) => { enabled = value !== false })
  return {
    get enabled() { return enabled },
    load,
    subscribe(reload: () => Promise<void>) { listeners.add(reload); return () => { listeners.delete(reload) } },
    set(value: boolean, storage: Storage) {
      const next = pending.then(async () => {
        await load(storage)
        if (enabled === value && !dirty) return
        if (enabled !== value) {
          await storage.set("tools-enabled", value)
          enabled = value
        }
        dirty = true
        await Promise.all([...listeners].map((reload) => reload()))
        dirty = false
      })
      pending = next.catch(() => {})
      return next
    },
  }
}
