import { ChevronDown, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import UnreadDot from '../../components/UnreadDot'

/**
 * The side index of the character detail and its narrow-screen picker (odd/tasks/ficha-indice-lateral.md S1, S7, S11).
 * Entries are section keys: a link is `#<key>` and the host decides what going there means (scroll, reveal, hash).
 */
export interface IndexEntry {
  id: string
  label: string
  unread?: boolean
  /** DM-only entry (the DM notes): marked with a lock. */
  dm?: boolean
}
export interface IndexGroup {
  key: string
  label: string
  entries: IndexEntry[]
}

/** Above this many entries the categories of the index fold. */
export const FOLD_ENTRIES = 15

const HEADING = 'font-exo text-[10px] font-semibold tracking-[0.22em] uppercase text-txt-secondary'
const LINK = 'flex items-center gap-2 min-h-8 px-2.5 font-exo text-[12px] tracking-[0.04em] border-l-2 no-underline'

export function SectionIndex({ groups, active, onGo, label }: { groups: IndexGroup[]; active: string | null; onGo: (id: string) => void; label: string }) {
  const fold = groups.reduce((n, group) => n + group.entries.length, 0) > FOLD_ENTRIES
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  return (
    <nav aria-label={label}>
      {groups.map((group) => {
        const isClosed = fold && closed.has(group.key)
        const unread = group.entries.filter((entry) => entry.unread).length
        return (
          <div key={group.key} className="mt-4 first:mt-0">
            <h3 className={`${HEADING} mb-1`}>
              {fold ? (
                <button type="button" aria-expanded={!isClosed} onClick={() => toggle(group.key)} className={`${HEADING} flex items-center gap-1.5 w-full min-h-7 bg-transparent border-none p-0 cursor-pointer text-left hover:text-accent-bright`}>
                  <ChevronDown size={13} aria-hidden="true" className={`shrink-0 transition-transform motion-reduce:transition-none ${isClosed ? '-rotate-90' : ''}`} />
                  {group.label}
                  {isClosed && unread > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 tracking-normal text-txt-primary">
                      <UnreadDot unread />
                      <span aria-hidden="true">{unread}</span>
                      <span className="sr-only">{unread} con novedades</span>
                    </span>
                  )}
                </button>
              ) : (
                group.label
              )}
            </h3>
            {!isClosed && (
              <ul>
                {group.entries.map((entry) => {
                  const current = entry.id === active
                  return (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        aria-current={current ? 'location' : undefined}
                        onClick={(e) => {
                          e.preventDefault()
                          onGo(entry.id)
                        }}
                        className={`${LINK} ${current ? 'text-accent-bright bg-accent/10 border-accent' : 'text-txt-secondary border-transparent hover:text-txt-primary hover:bg-bg-card'}`}
                      >
                        {entry.label}
                        {entry.unread ? <UnreadDot unread className="ml-auto" /> : entry.dm ? <Lock size={11} aria-hidden="true" className="ml-auto" /> : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** Narrow screens: "Sección: {label}" with its position, opening the same index as a list (Esc closes it). */
export function SectionPicker({ groups, active, onGo }: { groups: IndexGroup[]; active: string | null; onGo: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const entries = groups.flatMap((group) => group.entries)
  const index = Math.max(0, entries.findIndex((entry) => entry.id === active))
  const current = entries[index]
  if (!current) return null
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 w-full min-h-11 px-3.5 bg-bg-card border-none border-b border-border-light font-exo text-[12px] tracking-[0.12em] uppercase text-txt-primary cursor-pointer"
      >
        <span className="truncate">Sección: {current.label}</span>
        <span className="shrink-0 normal-case tracking-[0.04em] text-txt-secondary">
          {index + 1} de {entries.length} <span aria-hidden="true">▾</span>
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 max-h-[60vh] overflow-y-auto bg-bg-deep border border-border-light p-3">
          <SectionIndex
            groups={groups}
            active={active}
            label="Secciones"
            onGo={(id) => {
              setOpen(false)
              onGo(id)
            }}
          />
        </div>
      )}
    </div>
  )
}
