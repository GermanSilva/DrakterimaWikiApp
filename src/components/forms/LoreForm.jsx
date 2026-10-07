import { useState } from 'react'
import { useFormActions } from '../../ports'

import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../../constants'
import { FormGroup, EstadoField, LockIcon } from './formFields'

export default function LoreForm({ item }) {
  const { save, remove, closeForm, activeFieldRef, saving } = useFormActions()
  const [f, setF] = useState({
    titulo: item?.titulo ?? '',
    categoria: item?.categoria ?? '',
    descripcion: item?.descripcion ?? '',
    notas: item?.notas ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormGroup><label className={labelCls}>Título</label><input className={inputCls} value={f.titulo} onChange={set('titulo')} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Categoría</label>
        <input className={inputCls} value={f.categoria} onChange={set('categoria')} placeholder="Ej: historia, geografía, recurso, magia..." />
      </FormGroup>
      <FormGroup><label className={labelCls}>Descripción (pública / conocida)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}><LockIcon />Información secreta (solo DM)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('lore', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={() => save('lore', { ...f, id: item?.id, categoria: f.categoria.toLowerCase() })}>Guardar</button>
      </div>
    </div>
  )
}
