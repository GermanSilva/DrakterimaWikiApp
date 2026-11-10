import { SHEET_LIMITS } from '../sheet/sheetModel'
import { CARD_PINNED } from '../sheet/card'
import { useBuilder } from './builderContext'
import { isNode, type Node } from './draft'
import { CheckInput, PanelErrors, ReorderButtons, SelectInput, smallBtn } from './ui'

const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])
const items = (draft: Node): Node[] => nodes(draft.categories).flatMap((c) => nodes(c.sections)).flatMap((s) => nodes(s.items)).filter((i) => typeof i.key === 'string')
const option = (i: Node) => ({ value: i.key as string, label: `${typeof i.label === 'string' ? i.label : ''} (${i.key as string})` })

/**
 * What the character card and the detail header show besides identity and roles (odd/tasks/ficha-indice-lateral.md S14):
 * up to 6 pinned fields (the card shows the first 4), each with an optional maximum drawn as a bar and "Solo DM";
 * the Stat table of the card's line; the text field of its excerpt.
 */
export function CardPanel() {
  const { draft, edit } = useBuilder()
  const card = isNode(draft.card) ? draft.card : null
  const all = items(draft)
  const pinnable = all.filter((i) => i.kind === 'field' || i.type === 'monedas' || i.type === 'economia')
  const numbers = all.filter((i) => i.kind === 'field' && i.type === 'number')
  const stats = all.filter((i) => i.kind === 'table' && i.type === 'stat')
  const texts = all.filter((i) => i.kind === 'field' && (i.type === 'short' || i.type === 'paragraph'))
  const pinned = card ? nodes(card.pinned) : []
  const setCard = (update: (card: Node) => Node | null) =>
    edit((d) => {
      const next = update(isNode(d.card) ? d.card : { pinned: [] })
      if (next) return { ...d, card: next }
      return Object.fromEntries(Object.entries(d).filter(([name]) => name !== 'card'))
    })
  const setPins = (update: (pins: Node[]) => Node[]) => setCard((c) => ({ ...c, pinned: update(nodes(c.pinned)) }))
  const setPin = (index: number, patch: Node) =>
    setPins((pins) => pins.map((pin, i) => (i === index ? Object.fromEntries(Object.entries({ ...pin, ...patch }).filter(([, v]) => v !== undefined)) : pin)))
  const setRef = (name: 'statline' | 'excerpt', key: string) =>
    setCard((c) => Object.fromEntries(Object.entries({ ...c, [name]: key === '' ? undefined : key }).filter(([, v]) => v !== undefined)))

  return (
    <fieldset className="border border-border-base px-4 py-3 flex flex-col gap-3">
      <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Tarjeta del personaje</legend>
      <PanelErrors path={['card']} />
      <p className="text-[12px] text-txt-muted">
        Además de la identidad y los roles, el encabezado de la ficha muestra hasta {SHEET_LIMITS.pinned} campos fijados y la tarjeta de la lista los primeros {CARD_PINNED}. Sin configurar, la tarjeta muestra lo de siempre.
      </p>
      {!card ? (
        <div>
          <button type="button" className={smallBtn} onClick={() => setCard((c) => c)}>Configurar tarjeta</button>
        </div>
      ) : (
        <>
          {pinned.map((pin, i) => {
            const key = typeof pin.key === 'string' ? pin.key : ''
            const isNumber = numbers.some((n) => n.key === key)
            return (
              <fieldset key={i} aria-label={`Fijado n.º ${i + 1}`} className="border border-border-base px-3 py-2 flex flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectInput label={`Campo fijado n.º ${i + 1}`} value={key} onChange={(v) => setPin(i, { key: v, max: undefined })} options={[{ value: '', label: 'Elegí un campo' }, ...pinnable.map(option)]} />
                  {isNumber && (
                    <SelectInput
                      label="Máximo (barra)"
                      value={typeof pin.max === 'string' ? pin.max : ''}
                      onChange={(v) => setPin(i, { max: v === '' ? undefined : v })}
                      options={[{ value: '', label: 'Sin máximo' }, ...numbers.filter((n) => n.key !== key).map(option)]}
                    />
                  )}
                </div>
                <CheckInput label="Solo DM" checked={pin.dmOnly === true} onChange={(on) => setPin(i, { dmOnly: on ? true : undefined })} />
                <ReorderButtons
                  noun="campo fijado"
                  index={i}
                  count={pinned.length}
                  onMove={(delta) => setPins((pins) => { const next = [...pins]; const [moved] = next.splice(i, 1); next.splice(i + delta, 0, moved); return next })}
                  onRemove={() => setPins((pins) => pins.filter((_, j) => j !== i))}
                />
              </fieldset>
            )
          })}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallBtn} disabled={pinned.length >= SHEET_LIMITS.pinned} onClick={() => setPins((pins) => [...pins, { key: '' }])}>Agregar campo fijado</button>
            <button type="button" className={smallBtn} onClick={() => setCard(() => null)}>Quitar configuración de la tarjeta</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput label="Línea de stats" value={typeof card.statline === 'string' ? card.statline : ''} onChange={(v) => setRef('statline', v)} options={[{ value: '', label: 'Sin línea de stats' }, ...stats.map(option)]} />
            <SelectInput label="Extracto" value={typeof card.excerpt === 'string' ? card.excerpt : ''} onChange={(v) => setRef('excerpt', v)} options={[{ value: '', label: 'Sin extracto (trasfondo)' }, ...texts.map(option)]} />
          </div>
        </>
      )}
    </fieldset>
  )
}
