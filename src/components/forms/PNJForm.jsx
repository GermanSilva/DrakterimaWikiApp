import { useState } from 'react'
import { useFormActions, useFormPort } from '../../ports'
import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../../constants'
import { FormGroup, FormRow, EstadoField, LockIcon } from './formFields'

export default function PNJForm({ item }) {
  const { save, remove, closeForm, activeFieldRef, saving } = useFormActions()
  const { regions } = useFormPort()
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    rol: item?.rol ?? '',
    region: item?.region ?? regions[0]?.key ?? 'otro', // never an empty region
    relacion: item?.relacion ?? 'neutral',
    faccion: item?.faccion ?? '',
    descripcion: item?.descripcion ?? '',
    historia: item?.historia ?? '',
    secreto: item?.secreto ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Rol / Título</label><input className={inputCls} value={f.rol} onChange={set('rol')} placeholder="Ej: Comandante, Mercader..." /></div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Región</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regions.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Relación con el grupo</label>
          <select className={inputCls} value={f.relacion} onChange={set('relacion')}>
            {['neutral', 'aliado', 'enemigo', 'desconocido'].map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Facción / Organización</label><input className={inputCls} value={f.faccion} onChange={set('faccion')} placeholder="Ej: Orden de Argan..." /></FormGroup>
      <FormGroup><label className={labelCls}>Descripción física y personalidad</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Historia / Contexto</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.historia} onChange={set('historia')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'historia' } }} /></FormGroup>
      <FormGroup><label className={labelCls}><LockIcon />Motivaciones secretas</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.secreto} onChange={set('secreto')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'secreto' } }} /></FormGroup>
      <FormGroup><label className={labelCls}><LockIcon />Notas del DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('pnjs', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={() => save('pnjs', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}
