import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = { nombre: '', nivel: 0 }
const LEVELS = ['Truco (0)', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function SpellsCRUD({ hechizos = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(h) { setDraft({ ...h }); setEditingId(h.id) }
  function cancel() { setEditingId(null) }

  function confirm() {
    const item = { ...draft, nivel: parseInt(draft.nivel) || 0 }
    if (editingId === 'new') {
      onChange([...hechizos, { ...item, id: Date.now() }])
    } else {
      onChange(hechizos.map(h => h.id === editingId ? { ...item, id: editingId } : h))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(hechizos.filter(h => h.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-2">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><label className={labelCls}>Nombre del hechizo</label><input className={inputCls} value={draft.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Nivel</label>
          <select className={inputCls} value={draft.nivel} onChange={set('nivel')}>
            {LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
        <button type="button" className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none" onClick={confirm}>Guardar</button>
      </div>
    </div>
  )

  const byLevel = {}
  hechizos.forEach(h => {
    const lvl = h.nivel ?? 0
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(h)
  })
  const LEVEL_LABELS = ['Trucos', 'Niv 1', 'Niv 2', 'Niv 3', 'Niv 4', 'Niv 5', 'Niv 6', 'Niv 7', 'Niv 8', 'Niv 9']

  return (
    <div>
      {Object.keys(byLevel).sort((a, b) => a - b).map(lvl => (
        <div key={lvl} className="mb-3">
          <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1.5">{LEVEL_LABELS[lvl] ?? `Niv ${lvl}`}</div>
          <div className="space-y-1">
            {byLevel[lvl].map(h => (
              <div key={h.id}>
                {editingId === h.id ? inlineForm : (
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-txt-primary flex-1">{h.nombre}</span>
                    <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px]" onClick={() => startEdit(h)}>✎</button>
                    <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(h.id)}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {editingId === 'new' && inlineForm}
      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1" onClick={startAdd}>
          + Agregar hechizo
        </button>
      )}
    </div>
  )
}
