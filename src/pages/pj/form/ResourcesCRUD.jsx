import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = { nombre: '', maximo: 0, actual: '', recuperacion: 'largo', notas: '' }
const RECUPERACION_OPTIONS = [
  { value: 'corto', label: 'Descanso Corto' },
  { value: 'largo', label: 'Descanso Largo' },
]

export default function ResourcesCRUD({ recursos = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(r) { setDraft({ ...EMPTY, ...r }); setEditingId(r.id) }
  function cancel() { setEditingId(null) }

  function confirm() {
    const maximo = parseInt(draft.maximo) || 0
    const actual = draft.actual === '' ? maximo : (parseInt(draft.actual) || 0)
    const item = { ...draft, maximo, actual }
    if (editingId === 'new') {
      onChange([...recursos, { ...item, id: Date.now() }])
    } else {
      onChange(recursos.map(r => r.id === editingId ? { ...item, id: editingId } : r))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(recursos.filter(r => r.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-1 mb-2">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={labelCls}>Nombre</label>
          <input className={inputCls} value={draft.nombre} onChange={set('nombre')} placeholder="Puntos de Hechicería" />
        </div>
        <div>
          <label className={labelCls}>Recuperación</label>
          <select className={inputCls} value={draft.recuperacion} onChange={set('recuperacion')}>
            {RECUPERACION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Máximo</label>
          <input className={inputCls} type="number" min="0" value={draft.maximo} onChange={set('maximo')} />
        </div>
        <div>
          <label className={labelCls}>Actual</label>
          <input className={inputCls} type="number" min="0" value={draft.actual} onChange={set('actual')} placeholder={String(draft.maximo || 0)} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notas</label>
          <input className={inputCls} value={draft.notas} onChange={set('notas')} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
          onClick={confirm}
        >
          Guardar
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {recursos.map(item => (
        <div key={item.id}>
          {editingId === item.id ? inlineForm : (
            <div className="flex items-center gap-2 py-1 border-b border-border-base/40 text-[13px]">
              <span className="text-txt-primary font-medium flex-1">{item.nombre}</span>
              <span className="text-txt-secondary">{item.actual}/{item.maximo}</span>
              <span className="font-exo text-[9px] font-semibold tracking-[0.1em] uppercase text-txt-muted border border-border-base px-1.5 py-0.5">
                {RECUPERACION_OPTIONS.find(o => o.value === (item.recuperacion ?? 'largo'))?.label}
              </span>
              {item.notas && <span className="text-txt-muted text-[12px] truncate max-w-[200px]">{item.notas}</span>}
              <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px]" onClick={() => startEdit(item)}>✎</button>
              <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(item.id)}>✕</button>
            </div>
          )}
        </div>
      ))}
      {editingId === 'new' && inlineForm}
      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1 mb-4" onClick={startAdd}>
          + Agregar recurso
        </button>
      )}
    </div>
  )
}
