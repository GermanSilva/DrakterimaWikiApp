import type { ScopeEntry } from '../../sheet/formulaScope'

interface Props {
  id: string
  entries: readonly ScopeEntry[]
  active: number
  heading: (entry: ScopeEntry) => string
  valueOf: (ref: string) => string
  optionId: (index: number) => string
  onPick: (entry: ScopeEntry) => void
  /** Shown instead of options when nothing matches what was typed. */
  note?: string
}

/** The entries in runs of the same group, each with its index in the whole list. */
function runs(entries: readonly ScopeEntry[]): { group: string; items: { entry: ScopeEntry; index: number }[] }[] {
  const out: { group: string; items: { entry: ScopeEntry; index: number }[] }[] = []
  entries.forEach((entry, index) => {
    const last = out[out.length - 1]
    if (last && last.group === entry.group) last.items.push({ entry, index })
    else out.push({ group: entry.group, items: [{ entry, index }] })
  })
  return out
}

/** The listbox of the autocomplete: options grouped under their headings, each with its reference, name and value for the test character. */
export function CompletionList({ id, entries, active, heading, valueOf, optionId, onPick, note }: Props) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Referencias disponibles"
      className="absolute left-0 right-0 top-full z-20 max-h-[300px] overflow-auto border border-border-light bg-bg-card shadow-[0_12px_32px_rgba(0,0,0,0.6)] sm:right-auto sm:w-[360px]"
    >
      {note && <p className="px-3 py-2.5 text-[12px] text-txt-muted">{note}</p>}
      {runs(entries).map(({ group, items }) => (
        <div key={group} role="group" aria-labelledby={`${id}-g-${group}`}>
          <div id={`${id}-g-${group}`} className="px-3 pt-2 pb-1 font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted">
            {heading(items[0].entry)}
          </div>
          {items.map(({ entry, index }) => (
            <div
              key={entry.ref}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              data-ref={entry.ref}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(entry)}
              className={`grid cursor-pointer grid-cols-[1fr_auto] gap-x-2.5 px-3 py-1.5 ${index === active ? 'bg-bg-card-hover shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-bg-card-hover'}`}
            >
              <code className="font-mono text-[13px] text-[color:var(--brand-3)]">{`{${entry.ref}}`}</code>
              <span className="text-right font-mono text-[12px] text-txt-primary">{valueOf(entry.ref)}</span>
              <span className="col-span-2 text-[12px] text-txt-secondary">
                {entry.label}
                {entry.tableOnly ? ' · tabla (solo dentro de una función de tabla)' : ''}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
