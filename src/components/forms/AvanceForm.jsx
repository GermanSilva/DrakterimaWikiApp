import { useState } from 'react'
import { useFormActions, useFormPort } from '../../ports'
import { calcularOrden } from '../../helpers'
import PosicionField from './PosicionField'
import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../../constants'
import { FormGroup, EstadoField, LockIcon } from './formFields'

export default function AvanceForm({ item }) {
  const { save, remove, closeForm, activeFieldRef, saving } = useFormActions()
  const { sesiones } = useFormPort()
  const sortedAll = [...sesiones].sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
  const itemOrden = item ? (item.orden ?? item.numero * 100) : null
  const defaultAfterId = item
    ? (sortedAll.filter(s => s.id !== item.id && (s.orden ?? s.numero * 100) < itemOrden).pop()?.id ?? null)
    : (sortedAll.length > 0 ? sortedAll[sortedAll.length - 1].id : null)
  const [f, setF] = useState({
    titulo: item?.titulo ?? '',
    texto: item?.texto ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
    afterId: defaultAfterId,
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    const forOrden = sortedAll.filter(s => s.id !== item?.id)
    const orden = calcularOrden(f.afterId, forOrden)
    const { afterId, ...rest } = f
    save('sesiones', { ...rest, id: item?.id, tipo: 'avance', orden })
  }

  return (
    <div>
      <FormGroup>
        <label className={labelCls}>Título del Avance</label>
        <input className={inputCls} value={f.titulo} onChange={set('titulo')} placeholder="Ej: Algo se acerca..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Texto</label>
        <textarea className={`${inputCls} resize-y min-h-[120px]`} rows={6} value={f.texto} onChange={set('texto')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'texto' } }}
          placeholder="Bloque de lore, diálogo críptico, teaser narrativo..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}><LockIcon />Notas del DM</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.notas} onChange={set('notas')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }}
          placeholder="Notas internas..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <PosicionField afterId={f.afterId} setAfterIdFn={v => setF(p => ({ ...p, afterId: v }))} currentId={item?.id} />
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('sesiones', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
