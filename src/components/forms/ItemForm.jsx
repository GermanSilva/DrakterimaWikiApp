import { useState } from 'react'
import { useFormActions } from '../../ports'

import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../../constants'
import { FormGroup, FormRow, EstadoField } from './formFields'

export default function ItemForm({ item }) {
  const { save, remove, closeForm, activeFieldRef, saving } = useFormActions()
  const tipoOpts = ['arma', 'armadura', 'objeto maravilloso', 'foco arcano', 'poción', 'pergamino', 'anillo', 'varita', 'bastón', 'otro']
  const rarezaOpts = ['común', 'infrecuente', 'raro', 'muy raro', 'legendario', 'artefacto']
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    tipo: item?.tipo ?? 'objeto maravilloso',
    rareza: item?.rareza ?? 'raro',
    requiere_sintonia: item?.requiere_sintonia ?? false,
    descripcion: item?.descripcion ?? '',
    lore: item?.lore ?? '',
    poseedor: item?.poseedor ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Rareza</label>
          <select className={inputCls} value={f.rareza} onChange={set('rareza')}>
            {rarezaOpts.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>¿Requiere sintonía?</label>
          <select className={inputCls} value={f.requiere_sintonia ? 'si' : 'no'} onChange={e => setF(p => ({ ...p, requiere_sintonia: e.target.value === 'si' }))}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción y propiedades</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Historia / Lore del objeto</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.lore} onChange={set('lore')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'lore' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Poseedor actual</label><input className={inputCls} value={f.poseedor} onChange={set('poseedor')} placeholder="Nombre del PJ o PNJ" /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('items', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={() => save('items', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}
