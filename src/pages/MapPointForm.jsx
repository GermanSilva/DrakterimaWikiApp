import { useState } from 'react'
import { useApp } from '../AppContext'
import { FormGroup, FormRow, EstadoField } from '../components/FormModal'
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

const LABEL_KEY = {
  lugar: 'nombre', pnj: 'nombre', faccion: 'nombre',
  lore: 'titulo', item: 'nombre', sesion: 'titulo', mapa: 'nombre',
}

export default function MapPointForm({ item, prefill }) {
  const { db, save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    map_id:      item?.map_id      ?? prefill?.map_id ?? null,
    nombre:      item?.nombre      ?? '',
    descripcion: item?.descripcion ?? '',
    x:           item?.x           ?? prefill?.x ?? 0.5,
    y:           item?.y           ?? prefill?.y ?? 0.5,
    link_type:   item?.link_type   ?? '',
    link_id:     item?.link_id     ?? null,
    estado:      item?.estado      ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  const coll = COLL_MAP[f.link_type]
  const entities = coll ? (db[coll] ?? []) : []
  const labelKey = LABEL_KEY[f.link_type] ?? 'nombre'

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
              <option value="">— elegir —</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e[labelKey] || `(id ${e.id})`}</option>)}
            </select>
          </div>
        )}
      </FormRow>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('map_points', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('map_points', { ...f, id: item?.id, link_type: f.link_type || null })}>Guardar</button>
      </div>
    </div>
  )
}
