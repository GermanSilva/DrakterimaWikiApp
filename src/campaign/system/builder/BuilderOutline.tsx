import { useState } from 'react'
import { useBuilder } from './builderContext'
import { isNode, type Node, type Path } from './draft'
import { itemKindHint } from './itemLabels'

const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const matches = (node: Node, query: string) => text(node.label).toLowerCase().includes(query) || text(node.key).toLowerCase().includes(query)

interface Row {
  path: Path
  label: string
  hint?: string
  depth: number
}

interface Props {
  /** The path (joined with ".") of the part last chosen here. */
  current: string | null
  onNavigate: (path: Path) => void
}

function Entry({ row, current, onNavigate }: { row: Row; current: string | null; onNavigate: (path: Path) => void }) {
  const { hasErrorsUnder } = useBuilder()
  const id = row.path.join('.')
  const invalid = hasErrorsUnder(row.path)
  return (
    <li style={{ paddingLeft: row.depth * 12 }}>
      <button
        type="button"
        aria-current={current === id ? 'true' : undefined}
        data-invalid={invalid ? true : undefined}
        onClick={() => onNavigate(row.path)}
        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[13px] cursor-pointer bg-transparent border-0 border-l-2 ${current === id ? 'border-accent text-txt-primary' : 'border-transparent text-txt-secondary hover:text-txt-primary'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${row.depth === 0 ? 'font-exo font-semibold uppercase tracking-[0.1em] text-[11px]' : ''}`}>{row.label}</span>
        {row.hint && <span className="shrink-0 text-[11px] text-txt-muted">{row.hint}</span>}
        {invalid && (
          <span role="img" aria-label="Con errores" className="shrink-0 text-red-400">
            ●
          </span>
        )}
      </button>
    </li>
  )
}

/** The rows to show: a part matching the search brings its whole branch; one that only contains a match shows just the way to it. */
function outlineRows(categories: Node[], query: string): Row[] {
  const rows: Row[] = []
  categories.forEach((category, ci) => {
    const categoryHit = query === '' || matches(category, query)
    const inside: Row[] = []
    nodes(category.sections).forEach((section, si) => {
      const sectionHit = categoryHit || matches(section, query)
      const items: Row[] = nodes(section.items).flatMap((item, ii) =>
        sectionHit || matches(item, query) ? [{ path: ['categories', ci, 'sections', si, 'items', ii], label: text(item.label), hint: itemKindHint(item), depth: 2 }] : [],
      )
      if (sectionHit || items.length > 0) inside.push({ path: ['categories', ci, 'sections', si], label: text(section.label), depth: 1 }, ...items)
    })
    if (categoryHit || inside.length > 0) rows.push({ path: ['categories', ci], label: text(category.label), depth: 0 }, ...inside)
  })
  return rows
}

/** The left pane (S42 g): categories > sections > items of the draft, searchable by name or key; a click takes the editor to that part. */
export function BuilderOutline({ current, onNavigate }: Props) {
  const { draft } = useBuilder()
  const [query, setQuery] = useState('')
  const rows = outlineRows(nodes(draft.categories), query.trim().toLowerCase())
  return (
    <nav
      aria-label="Estructura de la ficha"
      className="min-w-0 border border-border-base bg-bg-card p-2 flex flex-col gap-2 max-[719px]:hidden min-[1100px]:sticky min-[1100px]:top-16 min-[1100px]:self-start min-[1100px]:max-h-[calc(100vh-6rem)] min-[1100px]:overflow-y-auto"
    >
      <input
        type="search"
        aria-label="Buscar en la estructura"
        placeholder="Buscar por nombre o clave"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full bg-bg-mid border border-border-base px-2 py-1 text-[13px] text-txt-primary"
      />
      {rows.length === 0 ? (
        <p className="px-2 text-[12px] text-txt-muted">Sin resultados</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <Entry key={row.path.join('.')} row={row} current={current} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </nav>
  )
}
