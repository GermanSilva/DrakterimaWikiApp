import { useEffect, useId, useRef } from 'react'
import { btnPrimary, btnSecondary } from '../../../../constants'
import { summarizeTab, useTabSaveApi } from './tabSaveContext'

export interface BarTab {
  id: string
  label: string
  /** "Guardar campaña", "Guardar plantilla"...; null for a tab whose blocks act immediately (it has no bar). */
  saveLabel: string | null
  /** The bar stays visible with no changes (the template editor). */
  alwaysVisible?: boolean
}

const changesText = (n: number) => (n === 0 ? 'Sin cambios' : n === 1 ? '1 cambio sin guardar' : `${n} cambios sin guardar`)
const errorsText = (n: number) => (n === 1 ? '1 error impide guardar' : `${n} errores impiden guardar`)

/**
 * The sticky bottom bar of the active tab: what is unsaved, what blocks saving, links to the other tabs with unsaved
 * changes, "Descartar" and the primary save of the whole tab. It slides in when the tab has changes (always shown on the
 * template tab), honouring prefers-reduced-motion, and leaves the accessibility tree and the tab order while hidden. A
 * short status announces the result even after the bar hides.
 */
export function TabSaveBar({ tabs, active, onSelect }: { tabs: readonly BarTab[]; active: string; onSelect: (id: string) => void }) {
  const api = useTabSaveApi()
  const reasonId = useId()
  const root = useRef<HTMLDivElement>(null)
  const tab = tabs.find((t) => t.id === active)
  const summary = summarizeTab(api.summaries, active)
  const result = api.results[active]
  const saving = api.saving.has(active)
  const on = !!tab?.saveLabel && (summary.dirty > 0 || !!tab.alwaysVisible || saving || result?.kind === 'failed')
  const blocked = summary.errors > 0
  const others = tabs.filter((t) => t.id !== active && summarizeTab(api.summaries, t.id).dirty > 0)

  // `inert` keeps a hidden bar out of the tab order and the screen readers (React 18 has no prop for it)
  useEffect(() => {
    root.current?.toggleAttribute('inert', !on)
  }, [on])

  // Leaving the page with unsaved changes asks first (a tab switch is not leaving: the drafts stay mounted).
  const anyDirty = api.summaries.some((b) => b.dirtyCount > 0)
  useEffect(() => {
    if (!anyDirty) return undefined
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [anyDirty])

  const status = result?.kind === 'saved' ? `Cambios de ${tab?.label} guardados.` : result?.kind === 'discarded' ? 'Cambios descartados.' : ''
  return (
    <>
      <p role="status" className={status ? 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border border-border-light bg-bg-card px-4 py-2.5 text-[13px] text-txt-primary shadow-lg' : 'sr-only'}>
        {status}
      </p>
      <div
        ref={root}
        role="region"
        aria-label="Guardar cambios"
        aria-hidden={on ? undefined : true}
        data-on={on ? 'true' : 'false'}
        className={`sticky bottom-0 z-20 -mt-[72px] transition-[transform,opacity] duration-200 motion-reduce:transition-none ${on ? '' : 'pointer-events-none translate-y-4 opacity-0'}`}
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border-light border-t-2 border-t-accent bg-bg-card px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
          <p className="min-w-0 text-[13px] text-txt-secondary">
            <b className="mr-2 font-exo text-[11px] font-semibold uppercase tracking-[0.1em] text-txt-primary">{tab?.label}</b>
            {changesText(summary.dirty)}
            {blocked && <span className="text-accent-bright"> · {errorsText(summary.errors)}</span>}
          </p>
          {others.length > 0 && (
            <p className="text-[12px] text-txt-muted">
              También sin guardar:{' '}
              {others.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ', '}
                  <button type="button" onClick={() => onSelect(t.id)} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-txt-secondary underline hover:text-txt-primary">
                    {t.label}
                  </button>
                </span>
              ))}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={`${btnSecondary} disabled:cursor-not-allowed disabled:opacity-40`} disabled={saving || summary.dirty === 0} onClick={() => api.discardTab(active)}>
              Descartar
            </button>
            {blocked && (
              <span id={reasonId} className="sr-only">
                {summary.reason}
              </span>
            )}
            <button
              type="button"
              className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-40`}
              disabled={saving || blocked || !summary.savable}
              aria-describedby={blocked ? reasonId : undefined}
              title={blocked ? summary.reason : undefined}
              onClick={() => void api.saveTab(active)}
            >
              {saving ? 'Guardando…' : tab?.saveLabel}
            </button>
          </div>
          {result?.kind === 'failed' && (
            <ul aria-live="polite" aria-label="No se guardó" className="basis-full list-none text-[13px] text-red-400">
              {result.failures.map((f) => (
                <li key={f.key}>
                  <strong>No se guardó {f.label}:</strong> <span>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
