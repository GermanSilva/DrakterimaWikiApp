import { useState } from 'react'
import { useFormActions, useWikiPort } from '../ports'
import { COLLECTION_LETTER } from '../components/wikiHelpers'
import { FormGroup, FormRow, EstadoField } from '../components/forms/formFields'
import { inputCls, labelCls, btnPrimary, btnSecondary, btnDanger } from '../constants'

const LINK_TYPES = [
  { value: '',        label: 'Sin link' },
  { value: 'lugar',   label: 'Lugar' },
  { value: 'pnj',     label: 'PNJ' },
  { value: 'faccion', label: 'Facción' },
  { value: 'lore',    label: 'Lore' },
  { value: 'item',    label: 'Ítem' },
  { value: 'sesion',  label: 'Sesión' },
  { value: 'mapa',    label: 'Mapa' },
]

const COLL_MAP = {
  lugar: 'lugares', pnj: 'pnjs', faccion: 'facciones',
  lore: 'lore', item: 'items', sesion: 'sesiones', mapa: 'mapas',
}

/** A stored / prefilled coordinate if it is a finite number (clamped to the image), else the centre. */
const coord = (...candidates) => {
  const v = candidates.find(c => typeof c === 'number' && Number.isFinite(c))
  return v === undefined ? 0.5 : Math.min(1, Math.max(0, v))
}

/** A link needs both halves (the database rejects a type without a target and vice versa). */
const linkFields = f => (f.link_type && f.link_id ? { link_type: f.link_type, link_id: f.link_id } : { link_type: null, link_id: null })

export default function MapPointForm({ item, prefill }) {
  const { save, remove, closeForm, saving } = useFormActions()
  const wiki = useWikiPort()
  const [f, setF] = useState({
    map_id:      item?.map_id      ?? prefill?.map_id ?? null,
    nombre:      item?.nombre      ?? '',
    descripcion: item?.descripcion ?? '',
    x:           coord(item?.x, prefill?.x),
    y:           coord(item?.y, prefill?.y),
    link_type:   item?.link_type   ?? '',
    link_id:     item?.link_id     ?? null,
    estado:      item?.estado      ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  // The linkable entities come from the wiki port (what the viewer can see: legacy db, hub RLS-filtered index)
  const coll = COLL_MAP[f.link_type]
  const entities = coll ? wiki.search('').filter(e => e.table === coll) : []
  const loadingTargets = !!coll && wiki.pending(COLLECTION_LETTER[coll])
  // The stored target must stay selectable (and labelled) even before the index delivers it, or it is not there
  // at all (hidden / deleted): otherwise the select would silently show "— elegir —" and a save would drop the link.
  const stored = f.link_id && !entities.some(e => e.id === f.link_id)
    ? { id: f.link_id, title: wiki.resolve(COLLECTION_LETTER[coll], f.link_id)?.title ?? '' }
    : null

  return (
    <div>
      <FormGroup>
        <label className={labelCls}>Nombre del punto</label>
        <input className={inputCls} value={f.nombre} onChange={set('nombre')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Descripción</label>
        <textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.descripcion} onChange={set('descripcion')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Posición en el mapa (solo lectura)</label>
        <div className="text-[12px] text-txt-muted font-mono">
          x: {f.x.toFixed(3)} · y: {f.y.toFixed(3)}
        </div>
      </FormGroup>
      <FormRow>
        <div>
          <label className={labelCls}>Tipo de enlace</label>
          <select className={inputCls} value={f.link_type} onChange={e => setF(p => ({ ...p, link_type: e.target.value, link_id: null }))}>
            {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {f.link_type && (
          <div>
            <label className={labelCls}>Entidad vinculada</label>
            <select className={inputCls} value={f.link_id ?? ''} onChange={e => setF(p => ({ ...p, link_id: Number(e.target.value) || null }))}>
              <option value="">{loadingTargets ? 'Cargando…' : '— elegir —'}</option>
              {stored && <option value={stored.id}>{stored.title || `(id ${stored.id})`}</option>}
              {entities.map(e => <option key={e.id} value={e.id}>{e.title || `(id ${e.id})`}</option>)}
            </select>
          </div>
        )}
      </FormRow>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('map_points', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={() => save('map_points', { ...f, id: item?.id, ...linkFields(f) })}>Guardar</button>
      </div>
    </div>
  )
}
