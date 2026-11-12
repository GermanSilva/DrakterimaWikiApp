import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import ScrollStrip from '../../../components/ScrollStrip'

/** What a tab can flag next to its label: unsaved changes (a dot) or a blocking error ("Error"). */
export type AjustesTabBadge = 'dirty' | 'error'

export interface AjustesTabDef<Id extends string = string> {
  id: Id
  label: string
  /** One badge, or both (a template with errors is also unsaved). Each also reads aloud: "cambios sin guardar" / "con errores". */
  badge?: AjustesTabBadge | readonly AjustesTabBadge[]
}

export const tabButtonId = (id: string) => `ajustes-tab-${id}`
export const tabPanelId = (id: string) => `ajustes-panel-${id}`

/**
 * The sticky tab bar of the settings page: an ARIA tablist (roving tabindex, ArrowLeft/ArrowRight wrap, Home/End) that
 * scrolls horizontally with chevrons when it does not fit. Controlled: the page owns the selected id (the URL).
 */
export function AjustesTabs<Id extends string>({ tabs, selected, onSelect }: { tabs: AjustesTabDef<Id>[]; selected: Id; onSelect: (id: Id) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1
    const pressed = event.key
    const next = pressed === 'ArrowRight' ? (index + 1) % tabs.length : pressed === 'ArrowLeft' ? (index + last) % tabs.length : pressed === 'Home' ? 0 : pressed === 'End' ? last : -1
    if (next < 0) return
    event.preventDefault()
    onSelect(tabs[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <div className="sticky top-0 z-20 bg-bg-deep border-b border-border-base mb-6">
      <ScrollStrip activeKey={selected}>
        <div role="tablist" aria-label="Secciones de ajustes" className="flex w-max min-w-full">
          {tabs.map((tab, i) => {
            const active = tab.id === selected
            const badges: readonly AjustesTabBadge[] = tab.badge === undefined ? [] : typeof tab.badge === 'string' ? [tab.badge] : tab.badge
            return (
              <button
                key={tab.id}
                ref={(el) => void (buttons.current[i] = el)}
                id={tabButtonId(tab.id)}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={tabPanelId(tab.id)}
                data-active={active ? 'true' : undefined}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => move(event, i)}
                className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-0 border-b-2 bg-transparent px-[18px] py-3 font-exo text-[11px] font-semibold tracking-[0.12em] uppercase cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent-dim motion-reduce:transition-none ${
                  active ? 'border-accent text-txt-primary' : 'border-transparent text-txt-muted hover:text-txt-secondary'
                }`}
              >
                {tab.label}
                {badges.includes('dirty') && <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-accent-bright shadow-[0_0_6px_rgba(239,68,68,0.65)]" />}
                {badges.includes('error') && <span aria-hidden="true" className="border border-accent-dim px-1 py-px text-[9px] tracking-[0.1em] text-accent-bright">Error</span>}
                {badges.length > 0 && <span className="sr-only">{[badges.includes('dirty') ? 'cambios sin guardar' : '', badges.includes('error') ? 'con errores' : ''].filter(Boolean).map((t) => ', ' + t).join('')}</span>}
              </button>
            )
          })}
        </div>
      </ScrollStrip>
    </div>
  )
}

/** One tab's panel. Always mounted: the inactive ones are `hidden`, so the drafts of their blocks survive a tab switch. */
export function AjustesTabPanel({ id, selected, children }: { id: string; selected: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={tabPanelId(id)} aria-labelledby={tabButtonId(id)} hidden={!selected}>
      {children}
    </div>
  )
}
