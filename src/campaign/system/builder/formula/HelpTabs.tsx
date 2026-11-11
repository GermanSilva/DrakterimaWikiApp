import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import ScrollStrip from '../../../../components/ScrollStrip'

export type HelpTab = 'explicar' | 'funciones' | 'dependencias'

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'explicar', label: 'Explicar el resultado' },
  { id: 'funciones', label: 'Funciones' },
  { id: 'dependencias', label: 'Dependencias' },
]

/** The three help tabs of the workbench (S42 f): an ARIA tablist with arrow keys; only the selected panel is rendered. */
export function HelpTabs({ panels }: { panels: Record<HelpTab, ReactNode> }) {
  const base = useId()
  const [selected, setSelected] = useState<HelpTab>('explicar')
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const tabId = (id: HelpTab) => `${base}-tab-${id}`

  const move = (e: KeyboardEvent, index: number) => {
    const last = TABS.length - 1
    const next = e.key === 'ArrowRight' ? (index + 1) % TABS.length : e.key === 'ArrowLeft' ? (index + last) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (next < 0) return
    e.preventDefault()
    setSelected(TABS[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <div>
      <ScrollStrip activeKey={selected} className="border-b border-border-base">
        <div role="tablist" aria-label="Ayudas de fórmula" className="flex w-max">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              ref={(el) => void (buttons.current[i] = el)}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected === tab.id}
              data-active={selected === tab.id ? 'true' : undefined}
              aria-controls={`${base}-panel`}
              tabIndex={selected === tab.id ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={(e) => move(e, i)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 bg-transparent px-3 py-2.5 font-exo text-[11px] font-semibold tracking-[0.08em] uppercase cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent-dim motion-reduce:transition-none ${
                selected === tab.id ? 'border-accent text-txt-primary' : 'border-transparent text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </ScrollStrip>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={tabId(selected)} className="p-3.5">
        {panels[selected]}
      </div>
    </div>
  )
}
