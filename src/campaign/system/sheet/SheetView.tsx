/**
 * Draws a resolved sheet (resolveSheet.ts) as the character detail: one titled section per sheet section, one block per
 * display mode. Section ids are `pj-section-<key>` so the nav, the unread observer and the scroll offsets of PJDetail
 * work unchanged. Copy and classes follow today's detail sections (src/pages/pj/detail) on purpose.
 */
import { useEffect, useId, useRef, useState } from 'react'
import UnreadDot from '../../../components/UnreadDot'
import WikiText from '../../../components/WikiText'
import { detailSectionCls, detailTextCls, sectionTitleCls } from '../../../constants'
import useBackdropClose from '../../../hooks/useBackdropClose'
import useDialogFocus from '../../../hooks/useDialogFocus'
import { formatNumber, type Cell, type ResolvedBlock, type ResolvedItem, type ResolvedSheet } from './resolveSheet'
import type { Column } from './sheetModel'

type Item<K extends ResolvedItem['kind']> = Extract<ResolvedItem, { kind: K }>
type Row = Record<string, unknown>

const TILE = 'flex flex-col items-center bg-bg-mid border border-border-base'
const LABEL = 'font-exo text-[10px] tracking-[0.1em] text-txt-muted uppercase'

const isEmptyValue = (value: unknown) => value === undefined || value === null || value === '' || value === false

/** A stored table cell as text, by the type of its column. */
function cellText(value: unknown, column: Column): string {
  if (isEmptyValue(value)) return ''
  if (column.type === 'boolean') return '✓'
  if (column.type === 'number' && typeof value === 'number') return formatNumber(value, column.format)
  return String(value)
}

function FieldTile({ item }: { item: Item<'field'> }) {
  if (item.error) {
    return (
      <div className="bg-bg-mid border border-border-base px-3 py-1.5" title="No se pudo calcular">
        <span className={`${LABEL} mr-2`}>{item.label}</span>
        <span className="text-[13px] text-txt-muted">—</span>
      </div>
    )
  }
  const shown = item.type === 'boolean' ? (item.value ? 'Sí' : 'No') : item.text
  return (
    <div className="bg-bg-mid border border-border-base px-3 py-1.5">
      <span className={`${LABEL} mr-2`}>{item.label}</span>
      <span className="text-[13px] text-txt-primary">{shown}</span>
    </div>
  )
}

function FieldBlock({ item }: { item: Item<'field'> }) {
  return (
    <div>
      <div className={LABEL}>{item.label}</div>
      <div className={detailTextCls}>
        <WikiText text={item.text} />
      </div>
    </div>
  )
}

function StatTiles({ item }: { item: Item<'stat'> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {item.rows.map((row) => (
        <div key={row.key} className={`${TILE} flex-1 gap-2 px-3 py-2 min-w-[52px]`}>
          <span className="font-exo text-[14px] tracking-[0.1em] text-txt-muted uppercase leading-none">{row.label}</span>
          <span className="font-exo text-[16px] font-bold text-txt-primary leading-none mb-0.5">{row.modifierText || '—'}</span>
          <span className="font-exo text-[10px] text-txt-secondary leading-none mb-1">{row.valueText}</span>
        </div>
      ))}
    </div>
  )
}

/** ◌ ● ◆ for a proficiency level 0 1 2 (or a flag), the plain value for anything else. */
function marker(cell: Cell | undefined): string {
  if (!cell || cell.value === null) return '◌'
  if (typeof cell.value === 'boolean') return cell.value ? '●' : '◌'
  if (typeof cell.value === 'number') return cell.value === 0 ? '◌' : cell.value === 1 ? '●' : cell.value === 2 ? '◆' : String(cell.value)
  return ''
}

interface Tile {
  stat: string
  label: string
  modifier: string
  rows: { key: string; label: string; marker: string; value: string }[]
}

/** One tile per linked stat, in the order the stats first appear; each tile lists the rows of every table linked to it. */
function capacidadesTiles(items: Item<'capacidades'>[]): Tile[] {
  const tiles = new Map<string, Tile>()
  for (const item of items) {
    const main = item.columns.findIndex((c) => c.formula !== undefined)
    for (const row of item.rows) {
      const tile = tiles.get(row.stat) ?? { stat: row.stat, label: row.statLabel, modifier: row.statModifierText, rows: [] }
      tiles.set(row.stat, tile)
      const cell = main >= 0 ? row.cells[main] : undefined
      const value = cell ? (cell.error ? '—' : cell.text) : row.linked === null ? '—' : formatNumber(row.linked, 'signed')
      tile.rows.push({ key: row.key, label: row.label, marker: marker(row.cells[0]), value })
    }
  }
  return [...tiles.values()]
}

function CapacidadesTiles({ items }: { items: Item<'capacidades'>[] }) {
  return (
    <div className="grid grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-2">
      {capacidadesTiles(items).map((tile) => (
        <div key={tile.stat} data-testid={`capacidades-${tile.stat}`} className="border border-border-base overflow-hidden">
          <div className="bg-bg-mid px-3 py-2 flex justify-between items-center">
            <span className="font-exo text-[12px] tracking-[0.1em] text-txt-muted uppercase">{tile.label}</span>
            <span className="font-exo text-[14px] font-bold text-accent-dim">{tile.modifier}</span>
          </div>
          <div className="px-3 py-2 space-y-0.5 text-[11px]">
            {tile.rows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <span className="text-txt-muted w-3" aria-hidden="true">{row.marker}</span>
                <span className="flex-1 text-txt-secondary">{row.label}</span>
                <span className="font-semibold text-txt-primary">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RowsTable({ item, hideLabel }: { item: Item<'rows'>; hideLabel: boolean }) {
  // a column nobody filled in is noise: the sheet may define more columns than a character uses
  const columns = item.columns.filter((c) => item.rows.some((row) => !isEmptyValue(row[c.key])))
  return (
    <div>
      {!hideLabel && <div className={LABEL}>{item.label}</div>}
      <table className="w-full text-[12px] border-collapse mt-1">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="font-exo text-[10px] uppercase tracking-[0.1em] text-txt-muted text-left pb-1 pr-3">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {item.rows.map((row, index) => (
            <tr key={index} className="border-b border-border-base/50">
              {columns.map((c) => (
                <td key={c.key} className="py-1 pr-3 text-txt-secondary">{cellText(row[c.key], c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Coins({ item }: { item: Item<'coins'> }) {
  const base = item.denominations[item.denominations.length - 1]
  const group = (title: string, list: Item<'coins'>['carried'], total: number) =>
    list.length === 0 ? null : (
      <div>
        <div className={LABEL}>{title}</div>
        <div className="flex flex-wrap gap-3 text-[13px] text-txt-secondary">
          {list.map((coin) => (
            <span key={coin.key}>
              {coin.label} <span className="font-exo text-[16px] font-bold text-txt-primary">{coin.amount}</span>
            </span>
          ))}
          {base && list.length > 0 && <span className="text-txt-muted">Total: {total} {base.label}</span>}
        </div>
      </div>
    )
  return (
    <div className="space-y-2">
      {group('En mano', item.carried, item.carriedTotal)}
      {group('Guardadas', item.stored, item.storedTotal)}
    </div>
  )
}

function RowModal({ item, row, onClose }: { item: Item<'rows'>; row: Row; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(dialogRef)
  const backdropProps = useBackdropClose(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown = item.columns.filter((c) => c.key !== 'nombre' && c.key !== 'categoria' && cellText(row[c.key], c) !== '')
  const short = shown.filter((c) => c.type !== 'paragraph')
  const long = shown.filter((c) => c.type === 'paragraph')
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70" {...backdropProps}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-bg-card border border-border-base max-w-lg w-full mx-4 px-4 max-h-[80vh] overflow-y-auto pb-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-4 border-b border-border-base flex items-start justify-between gap-4">
          <div>
            <div id={titleId} className="font-exo text-[18px] font-bold text-txt-primary uppercase">{String(row.nombre ?? '')}</div>
            {!isEmptyValue(row.categoria) && <div className="font-exo text-[11px] text-txt-muted tracking-[0.15em] uppercase mt-0.5">{String(row.categoria)}</div>}
          </div>
          <button type="button" className="text-txt-muted hover:text-txt-primary text-xl leading-none shrink-0 border-none bg-transparent cursor-pointer mt-0.5" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {short.length > 0 && (
          <div className={detailSectionCls}>
            <div className="grid grid-cols-2 gap-4">
              {short.map((c) => (
                <div key={c.key}>
                  <div className={LABEL}>{c.label}</div>
                  <div className="text-[13px] text-txt-secondary">{cellText(row[c.key], c)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {long.map((c) => (
          <div key={c.key} className={detailSectionCls}>
            <div className={sectionTitleCls}>{c.label}</div>
            <div className={detailTextCls}><WikiText text={String(row[c.key])} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModalGroups({ block }: { block: ResolvedBlock }) {
  const item = block.items.find((i): i is Item<'rows'> => i.kind === 'rows')
  const [selected, setSelected] = useState<Row | null>(null)
  if (!item) return null
  return (
    <div className="space-y-2">
      {(block.groups ?? []).map((group) => (
        <div key={group.category}>
          <div className={LABEL}>{group.category}</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {group.rows.map((row, index) => (
              <button
                key={index}
                type="button"
                className="px-2.5 py-1 text-[12px] border bg-bg-mid border-border-base text-txt-secondary hover:text-txt-primary cursor-pointer"
                onClick={() => setSelected(row)}
              >
                {String(row.nombre ?? '')}
              </button>
            ))}
          </div>
        </div>
      ))}
      {selected && <RowModal item={item} row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function Block({ block, sectionLabel }: { block: ResolvedBlock; sectionLabel: string }) {
  const fields = block.items.filter((i): i is Item<'field'> => i.kind === 'field' && !i.empty)
  let body
  if (block.mode === 'modal') {
    body = <ModalGroups block={block} />
  } else if (block.mode === 'tile') {
    body = (
      <>
        <div className="flex flex-wrap gap-3">{fields.filter((f) => f.type !== 'paragraph').map((f) => <FieldTile key={f.key} item={f} />)}</div>
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-x-8 gap-y-3 mt-2">{fields.filter((f) => f.type === 'paragraph').map((f) => <FieldBlock key={f.key} item={f} />)}</div>
      </>
    )
  } else if (block.mode === 'capacidades') {
    body = <CapacidadesTiles items={block.items.filter((i): i is Item<'capacidades'> => i.kind === 'capacidades')} />
  } else {
    // 'stat' and 'plano': each item in its natural form
    body = (
      <div className="space-y-3">
        {block.items.map((item) => {
          if (item.empty) return null
          if (item.kind === 'stat') return <StatTiles key={item.key} item={item} />
          if (item.kind === 'capacidades') return <CapacidadesTiles key={item.key} items={[item]} />
          if (item.kind === 'rows') return <RowsTable key={item.key} item={item} hideLabel={sameLabel(item.label, sectionLabel)} />
          if (item.kind === 'coins') return <Coins key={item.key} item={item} />
          return item.type === 'paragraph' ? <FieldBlock key={item.key} item={item} /> : <FieldTile key={item.key} item={item} />
        })}
      </div>
    )
  }
  return (
    <div>
      {block.title && <div className={`${LABEL} mb-1`}>{block.title}</div>}
      {body}
    </div>
  )
}

export default function SheetView({ resolved, unread }: { resolved: ResolvedSheet; unread: Record<string, boolean> }) {
  return (
    <div data-sheet-view>
      {resolved.sections
        .filter((section) => !section.empty)
        .map((section) => (
          <div key={section.key} id={`pj-section-${section.key}`} className="pt-4">
            <div className={sectionTitleCls}>
              {section.label}
              <UnreadDot unread={unread[section.key]} className="ml-2 inline-block align-middle" />
            </div>
            <div className="flex flex-col gap-3">
              {section.blocks
                .filter((block) => !block.empty)
                .map((block) => (
                  <Block key={block.key} block={block} sectionLabel={section.label} />
                ))}
            </div>
          </div>
        ))}
    </div>
  )
}
