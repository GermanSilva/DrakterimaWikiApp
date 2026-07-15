import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../../../AppContext'
import { labelCls, inputCls, btnPrimary, btnSecondary } from '../../../constants'
import SessionCardShell from './SessionCardShell'

const EMPTY_FORM = { nombre: '', texto: '' }

// Read/select/create/hard-delete only — no bespoke mutations, everything goes
// through the generic `save`/`remove('homebrew_rules', ...)` path (design
// decision). Duplicate rule names are explicitly allowed by spec, so no
// uniqueness check is performed before creating.
export default function SessionCardRules({ db }) {
  const { save, remove } = useApp()
  const rules = db?.homebrew_rules ?? []
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const selectedRule = rules.find(r => r.id === selectedId) ?? null

  function submitCreate(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    save('homebrew_rules', { nombre: form.nombre.trim(), texto: form.texto })
    setForm(EMPTY_FORM)
    setCreating(false)
  }

  function handleDelete(id) {
    remove('homebrew_rules', id)
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <SessionCardShell title="Reglas">
      {rules.length === 0 && !creating && (
        <div className="text-[13px] text-txt-muted mb-3">No hay reglas homebrew creadas todavía.</div>
      )}

      {rules.length > 0 && (
        <ul className="space-y-1 mb-3">
          {rules.map(rule => (
            <li key={rule.id} className="border border-border-base">
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  type="button"
                  className="flex-1 text-left font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.05em] cursor-pointer bg-transparent border-none"
                  onClick={() => setSelectedId(prev => (prev === rule.id ? null : rule.id))}
                >
                  {rule.nombre}
                </button>
                <button
                  type="button"
                  className="text-txt-muted hover:text-accent transition-colors p-1"
                  title="Eliminar regla"
                  onClick={() => handleDelete(rule.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {selectedId === rule.id && rule.texto && (
                <div className="px-3 pb-2 text-[12px] text-txt-secondary whitespace-pre-line">{rule.texto}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <form onSubmit={submitCreate} className="border border-border-base p-3">
          <div className="mb-2">
            <label className={labelCls}>Nombre</label>
            <input
              className={inputCls}
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="mb-3">
            <label className={labelCls}>Texto</label>
            <textarea
              className={`${inputCls} min-h-[100px] resize-y`}
              value={form.texto}
              onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary}>Guardar regla</button>
            <button type="button" className={btnSecondary} onClick={() => { setCreating(false); setForm(EMPTY_FORM) }}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className={btnSecondary} onClick={() => setCreating(true)}>+ Crear regla</button>
      )}
    </SessionCardShell>
  )
}
