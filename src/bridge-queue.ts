export type Delivery = { id: string; request: unknown }
type Pending = Delivery & { owner?: string; concurrent: boolean; resolve(value: unknown): void; reject(error: Error): void }

export function bridgeQueue(timeout = 15_000) {
  const pending = new Map<string, Pending>()
  let seen = 0
  let leader: string | undefined
  const cancellations = new Map<string, string[]>()
  return {
    poll(clientID: string): Delivery | { cancel: string } | null {
      const cancelled = cancellations.get(clientID)?.shift()
      if (cancelled) {
        if (!cancellations.get(clientID)?.length) cancellations.delete(clientID)
        return { cancel: cancelled }
      }
      if (leader !== clientID && Date.now() - seen < 5_000) return null
      leader = clientID
      seen = Date.now()
      // One in flight across windows/locations; writes must never run twice.
      if ([...pending.values()].some((item) => item.owner && !item.concurrent)) return null
      const item = [...pending.values()].find((item) => !item.owner)
      if (!item) return null
      item.owner = clientID
      return { id: item.id, request: item.request }
    },
    complete(clientID: string, id: string, result: unknown, error?: string) {
      const item = pending.get(id)
      if (!item || item.owner !== clientID) return
      pending.delete(id)
      if (error !== undefined) item.reject(new Error(error))
      else item.resolve(result)
    },
    async request(request: unknown, signal: AbortSignal, options: { concurrent?: boolean; timeout?: number } = {}): Promise<unknown> {
      if (signal.aborted) throw new Error("Board request cancelled")
      if (Date.now() - seen > 5_000) throw new Error("Open OpenCode Desktop with opencode-board enabled and connected to this server to use board tools.")
      if (pending.size >= 100) throw new Error("Too many pending board requests; try again shortly.")
      const id = crypto.randomUUID()
      let timer: ReturnType<typeof setTimeout> | undefined
      let abort: () => void = () => {}
      try {
        return await new Promise((resolve, reject) => {
          const cancel = (reason: string) => {
            const owner = pending.get(id)?.owner
            const delivered = !!owner
            if (owner && options.concurrent) {
              const items = cancellations.get(owner) ?? []
              cancellations.set(owner, [...items.slice(-99), id])
            }
            pending.delete(id)
            reject(new Error(delivered && !options.concurrent ? `${reason}. The request was delivered and may have been applied; read the board before retrying.` : reason))
          }
          abort = () => cancel("Board request cancelled")
          pending.set(id, { id, request, concurrent: options.concurrent ?? false, resolve, reject })
          signal.addEventListener("abort", abort, { once: true })
          timer = setTimeout(() => cancel("Desktop did not answer the board request"), options.timeout ?? timeout)
        })
      } finally {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        pending.delete(id)
      }
    },
  }
}
