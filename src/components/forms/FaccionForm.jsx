import { useState } from 'react'
import { useFormActions, useFormPort } from '../../ports'
import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../../constants'
import { FormGroup, FormRow, EstadoField, LockIcon } from './formFields'

export default function FaccionForm({ item }) {
  const { save, remove, closeForm, activeFieldRef, saving } = useFormActions()
  const { regions } = useFormPort()
  const tipoOpts = ['institución', 'militar', 'facción', 'gremio', 'culto', 'otro']
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    tipo: item?.tipo ?? 'facción',
    region: item?.region ?? regions[0]?.key ?? '',
    relacion: item?.relacion ?? 'neutral',
    descripcion: item?.descripcion ?? '',
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
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Región base</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regions.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Relación con el grupo</label>
          <select className={inputCls} value={f.relacion} onChange={set('relacion')}>
            {['neutral', 'aliado', 'enemigo'].map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}><LockIcon />Objetivos secretos</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.secreto} onChange={set('secreto')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'secreto' } }} /></FormGroup>
      <FormGroup><label className={labelCls}><LockIcon />Notas DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.notas} onChange={set('notas')}
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
        {item && <button className={btnDanger} onClick={() => remove('facciones', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={() => save('facciones', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}
