import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadJson, exportFilename } from './exportCampaign'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('exportFilename', () => {
  it('is <slug>-YYYY-MM-DD.json with zero-padded local date parts', () => {
    expect(exportFilename('leyendas', new Date(2026, 0, 5, 10, 30))).toBe('leyendas-2026-01-05.json')
    expect(exportFilename('demo', new Date(2026, 11, 31, 23, 59))).toBe('demo-2026-12-31.json')
  })
})

describe('downloadJson', () => {
  it('hands a pretty-printed JSON blob to the browser as a named download and releases the URL afterwards', async () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('demo-2026-10-09.json')
      expect(this.href).toBe('blob:fake')
    })

    downloadJson('demo-2026-10-09.json', { a: 1 })

    expect(click).toHaveBeenCalledTimes(1)
    const blob = (create.mock.calls[0] as unknown as [Blob])[0]
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('{\n  "a": 1\n}')
    expect(document.querySelector('a[download]')).toBeNull() // the temporary link is removed
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:fake')
  })
})
