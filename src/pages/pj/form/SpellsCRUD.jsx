import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = {
  nombre: '', nivel: 0, preparado: false, escuela: '',
  casting_time: '', alcance: '', componentes: '', duracion: '',
  concentracion: false, ritual: false,
  descripcion: '', a_niveles_superiores: '',
}
const LEVELS = ['Truco (0)', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Habilidad']
const LEVEL_LABELS = ['Trucos', 'Niv 1', 'Niv 2', 'Niv 3', 'Niv 4', 'Niv 5', 'Niv 6', 'Niv 7', 'Niv 8', 'Niv 9', 'Habilidades']

export default function SpellsCRUD({ hechizos = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [showUpcast, setShowUpcast] = useState(false)

  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))
  const toggle = k => e => setDraft(p => ({ ...p, [k]: e.target.checked }))

  function startAdd() { setDraft(EMPTY); setShowUpcast(false); setEditingId('new') }
  function startEdit(h) {
    setDraft({ ...EMPTY, ...h })
    setShowUpcast(!!h.a_niveles_superiores)
    setEditingId(h.id)
  }
  function cancel() { setEditingId(null); setShowUpcast(false) }

  function confirm() {
    const item = {
      ...draft,
      nivel: parseInt(draft.nivel) || 0,
      concentracion: !!draft.concentracion,
      ritual: !!draft.ritual,
      preparado: !!draft.preparado,
    }
    if (editingId === 'new') {
      onChange([...hechizos, { ...item, id: Date.now() }])
    } else {
      onChange(hechizos.map(h => h.id === editingId ? { ...item, id: editingId } : h))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(hechizos.filter(h => h.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Nombre</label>
          <input className={inputCls} value={draft.nombre} onChange={set('nombre')} />
        </div>
        <div>
          <label className={labelCls}>Nivel</label>
          <select className={inputCls} value={draft.nivel} onChange={set('nivel')}>
            {LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Escuela</label>
          <input className={inputCls} value={draft.escuela} onChange={set('escuela')} placeholder="Evocación…" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Tiempo lanzamiento</label>
          <input className={inputCls} value={draft.casting_time} onChange={set('casting_time')} placeholder="1 acción" />
        </div>
        <div>
          <label className={labelCls}>Alcance</label>
          <input className={inputCls} value={draft.alcance} onChange={set('alcance')} placeholder="18 m" />
        </div>
        <div>
          <label className={labelCls}>Componentes</label>
          <input className={inputCls} value={draft.componentes} onChange={set('componentes')} placeholder="V, S, M" />
        </div>
        <div>
          <label className={labelCls}>Duración</label>
          <input className={inputCls} value={draft.duracion} onChange={set('duracion')} placeholder="Instantáneo" />
        </div>
      </div>

      <div className="flex gap-5">
        <label className="flex items-center gap-2 cursor-pointer font-exo text-[11px] text-txt-secondary">
          <input type="checkbox" checked={!!draft.preparado} onChange={toggle('preparado')} />
          Preparado
        </label>
        <label className="flex items-center gap-2 cursor-pointer font-exo text-[11px] text-txt-secondary">
          <input type="checkbox" checked={!!draft.concentracion} onChange={toggle('concentracion')} />
          Concentración
        </label>
        <label className="flex items-center gap-2 cursor-pointer font-exo text-[11px] text-txt-secondary">
          <input type="checkbox" checked={!!draft.ritual} onChange={toggle('ritual')} />
          Ritual
        </label>
      </div>

      <div>
        <label className={labelCls}>Descripción</label>
        <textarea
          className={inputCls}
          rows={3}
          value={draft.descripcion}
          onChange={set('descripcion')}
          style={{ resize: 'vertical' }}
        />
      </div>

      {(showUpcast || draft.a_niveles_superiores) ? (
        <div>
          <label className={labelCls}>A niveles superiores</label>
          <textarea
            className={inputCls}
            rows={2}
            value={draft.a_niveles_superiores}
            onChange={set('a_niveles_superiores')}
            style={{ resize: 'vertical' }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors"
          onClick={() => setShowUpcast(true)}
        >
          + A niveles superiores
        </button>
      )}

      <div className="flex gap-2 pt-1">
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

  const byLevel = {}
  hechizos.forEach(h => {
    const lvl = h.nivel ?? 0
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(h)
  })

  return (
    <div>
      {Object.keys(byLevel).sort((a, b) => a - b).map(lvl => (
        <div key={lvl} className="mb-3">
          <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1.5">
            {LEVEL_LABELS[lvl] ?? `Niv ${lvl}`}
          </div>
          <div className="space-y-1">
            {byLevel[lvl].map(h => (
              <div key={h.id}>
                {editingId === h.id ? inlineForm : (
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-txt-primary flex-1">{h.nombre}</span>
                    {h.concentracion && <span className="font-exo text-[10px] text-txt-muted">C</span>}
                    {h.ritual && <span className="font-exo text-[10px] text-txt-muted">R</span>}
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
