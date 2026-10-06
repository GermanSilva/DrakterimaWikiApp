import { useState } from 'react'
import { useApp } from '../../AppContext'

import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../../constants'
import { FormGroup, EstadoField } from './formFields'

export default function HomeruleForm({ item }) {
  const { save, remove, closeForm, activeFieldRef } = useApp()
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    texto: item?.texto ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormGroup><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></FormGroup>
      <FormGroup><label className={labelCls}>Texto de la regla</label><textarea className={`${inputCls} resize-y min-h-[140px]`} rows={7} value={f.texto} onChange={set('texto')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'texto' } }} /></FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('homebrew_rules', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('homebrew_rules', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}
