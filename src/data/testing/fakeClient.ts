import type { Db } from '../types'

export interface RecordedCall {
  kind: 'from' | 'rpc'
  /** table name (from) or function name (rpc) */
  name: string
  /** rpc args */
  args?: unknown
  /** chained builder calls in order: [method, args] */
  ops: [string, unknown[]][]
}

export interface FakeResult {
  data?: unknown
  error?: { message: string; code?: string } | null
}

/** Minimal channel fake: records `.on` registrations and lets tests emit payloads. */
export class FakeChannel {
  name: string
  listeners: { type: string; filter: Record<string, unknown>; cb: (payload: never) => void }[] = []
  statusCb: ((status: string) => void) | null = null

  constructor(name: string) {
    this.name = name
  }

  on(type: string, filter: Record<string, unknown>, cb: (payload: never) => void) {
    this.listeners.push({ type, filter, cb })
    return this
  }

  subscribe(cb?: (status: string) => void) {
    this.statusCb = cb ?? null
    return this
  }

  /** Delivers a payload to the listener registered for `event` (INSERT | UPDATE | DELETE). */
  emit(event: string, payload: unknown) {
    for (const l of this.listeners) if (l.filter.event === event) l.cb(payload as never)
  }

  setStatus(status: string) {
    this.statusCb?.(status)
  }
}

/**
 * Chainable, thenable stand-in for the supabase-js client. Every `from()`/`rpc()` is recorded and
 * resolves with the next queued result (default `{ data: null, error: null }`).
 */
export function createFakeClient() {
  const calls: RecordedCall[] = []
  const queue: FakeResult[] = []
  const channels: FakeChannel[] = []
  const removed: FakeChannel[] = []

  function builder(call: RecordedCall): unknown {
    const proxy: unknown = new Proxy(() => undefined, {
      get(_target, prop) {
        if (prop === 'then') {
          const result = queue.shift() ?? {}
          const settled = { data: result.data ?? null, error: result.error ?? null }
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(settled).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          call.ops.push([String(prop), args])
          return proxy
        }
      },
    })
    return proxy
  }

  const client = {
    from(name: string) {
      const call: RecordedCall = { kind: 'from', name, ops: [] }
      calls.push(call)
      return builder(call)
    },
    rpc(name: string, args?: unknown) {
      const call: RecordedCall = { kind: 'rpc', name, args, ops: [] }
      calls.push(call)
      return builder(call)
    },
    channel(name: string) {
      const ch = new FakeChannel(name)
      channels.push(ch)
      return ch
    },
    removeChannel(ch: FakeChannel) {
      removed.push(ch)
      return Promise.resolve('ok')
    },
  }

  return {
    db: client as unknown as Db,
    calls,
    channels,
    removed,
    /** Throws if queued results were not consumed: the code under test did fewer requests than expected. */
    assertDrained() {
      if (queue.length > 0) throw new Error(`${queue.length} queued fake result(s) were never consumed`)
    },
    /** Queue the result of the next awaited query/rpc. */
    enqueue(...results: FakeResult[]) {
      queue.push(...results)
    },
  }
}

/** Looks up the args of a recorded builder op, e.g. opArgs(call, 'eq'). */
export function opsNamed(call: RecordedCall, method: string): unknown[][] {
  return call.ops.filter(([m]) => m === method).map(([, a]) => a)
}
