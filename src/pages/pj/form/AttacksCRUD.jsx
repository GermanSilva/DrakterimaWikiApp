import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = { nombre: '', bono_ataque: '', dano: '', tipo_dano: '', alcance: '', notas: '', precio: 0, precio_moneda: 'gp', portando: true }
const MONEDA_OPTIONS = ['cp', 'sp', 'ep', 'gp', 'pp']

export default function AttacksCRUD({ ataques = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(a) { setDraft({ ...EMPTY, ...a }); setEditingId(a.id) }
  function cancel() { setEditingId(null) }

  function togglePortando(id) {
    onChange(ataques.map(a => a.id === id ? { ...a, portando: !(a.portando ?? true) } : a))
  }

  function confirm() {
    const item = { ...draft, precio: parseInt(draft.precio) || 0 }
    if (editingId === 'new') {
      onChange([...ataques, { ...item, id: Date.now() }])
    } else {
      onChange(ataques.map(a => a.id === editingId ? { ...item, id: editingId } : a))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(ataques.filter(a => a.id !== id)) }

  const inlineFormCls = 'bg-bg-mid border border-border-base p-3 mt-2 space-y-2'

  const inlineFormContent = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Arma</label><input className={inputCls} value={draft.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Bono Ataque</label><input className={inputCls} value={draft.bono_ataque} onChange={set('bono_ataque')} placeholder="+5" /></div>
        <div><label className={labelCls}>Daño</label><input className={inputCls} value={draft.dano} onChange={set('dano')} placeholder="1d8+3" /></div>
        <div><label className={labelCls}>Tipo</label><input className={inputCls} value={draft.tipo_dano} onChange={set('tipo_dano')} placeholder="Cortante" /></div>
        <div><label className={labelCls}>Alcance</label><input className={inputCls} value={draft.alcance} onChange={set('alcance')} placeholder="5 ft" /></div>
        <div><label className={labelCls}>Notas</label><input className={inputCls} value={draft.notas} onChange={set('notas')} /></div>
        <div>
          <label className={labelCls}>Precio</label>
          <div className="flex gap-1">
            <input className={inputCls} type="number" min="0" value={draft.precio} onChange={set('precio')} />
            <select className={`${inputCls} w-auto`} value={draft.precio_moneda} onChange={set('precio_moneda')}>
              {MONEDA_OPTIONS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            id="ataque-portando"
            checked={draft.portando !== false}
            onChange={() => setDraft(p => ({ ...p, portando: !(p.portando ?? true) }))}
          />
          <label htmlFor="ataque-portando" className={labelCls}>Portando actualmente</label>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
        <button type="button" className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none" onClick={confirm}>Guardar</button>
      </div>
    </>
  )

  return (
    <div>
      {ataques.length > 0 && (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-border-base text-txt-muted font-exo text-[10px] uppercase tracking-[0.1em]">
                <th className="py-1.5 pr-2 w-4"></th>
                <th className="text-left py-1.5 pr-3 font-medium">Arma</th>
                <th className="text-center py-1.5 px-2 font-medium">Bono</th>
                <th className="text-center py-1.5 px-2 font-medium">Daño</th>
                <th className="text-left py-1.5 px-2 font-medium">Tipo</th>
                <th className="text-left py-1.5 px-2 font-medium">Alcance</th>
                <th className="text-right py-1.5 px-2 font-medium">Valor</th>
                <th className="py-1.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {ataques.map(a => (
                <tr key={a.id} className="border-b border-border-base/40">
                  {editingId === a.id ? (
                    <td colSpan={8} className={inlineFormCls}>
                      {inlineFormContent}
                    </td>
                  ) : (
                    <>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={a.portando !== false}
                          onChange={() => togglePortando(a.id)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-txt-primary font-medium">{a.nombre}</td>
                      <td className="text-center py-2 px-2 text-accent-dim">{a.bono_ataque}</td>
                      <td className="text-center py-2 px-2 text-txt-secondary">{a.dano}</td>
                      <td className="py-2 px-2 text-txt-muted">{a.tipo_dano}</td>
                      <td className="py-2 px-2 text-txt-muted">{a.alcance}</td>
                      <td className="py-2 px-2 text-txt-muted text-right">
                        {(parseInt(a.precio) > 0) ? `${a.precio} ${a.precio_moneda ?? 'gp'}` : ''}
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px] mr-2" onClick={() => startEdit(a)}>✎</button>
                        <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(a.id)}>✕</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingId === 'new' && (
        <div className={inlineFormCls}>
          {inlineFormContent}
        </div>
      )}

      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1" onClick={startAdd}>
          + Agregar ataque
        </button>
      )}
    </div>
  )
}
