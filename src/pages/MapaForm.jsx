import { useState } from 'react'
import { useApp } from '../AppContext'
import { FormGroup, FormRow, EstadoField } from '../components/FormModal'
import { inputCls, labelCls, btnPrimary, btnSecondary, btnDanger } from '../constants'

export default function MapaForm({ item, prefill }) {
  const { save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    nombre:     item?.nombre     ?? '',
    imagen_url: item?.imagen_url ?? '',
    descripcion: item?.descripcion ?? '',
    notas:      item?.notas      ?? '',
    is_default: item?.is_default ?? false,
    estado:     item?.estado     ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormGroup>
        <label className={labelCls}>Nombre</label>
        <input className={inputCls} value={f.nombre} onChange={set('nombre')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>URL de imagen del mapa</label>
        <input className={inputCls} type="url" placeholder="https://..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[120px] rounded object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Descripción</label>
        <textarea className={`${inputCls} resize-y min-h-[80px]`} rows={3} value={f.descripcion} onChange={set('descripcion')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Notas internas (solo DM)</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.notas} onChange={set('notas')} />
      </FormGroup>
      <FormGroup>
        <label className="flex items-center gap-2 text-[13px] text-txt-primary cursor-pointer">
          <input
            type="checkbox"
            checked={f.is_default}
            onChange={e => setF(p => ({ ...p, is_default: e.target.checked }))}
          />
          Mapa por defecto (se abre al entrar a la sección)
        </label>
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('mapas', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('mapas', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}
