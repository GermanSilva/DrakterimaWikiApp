import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = { nombre: '', cantidad: 1, descripcion: '', precio: 0, precio_moneda: 'gp', portando: true }
const CURRENCY_FIELDS = [
  { key: 'cp', label: 'Cobre' },
  { key: 'sp', label: 'Plata' },
  { key: 'ep', label: 'Electrum' },
  { key: 'gp', label: 'Oro' },
  { key: 'pp', label: 'Platino' },
]
const MONEDA_OPTIONS = ['cp', 'sp', 'ep', 'gp', 'pp']

function CurrencyGroup({ label, values, onChange }) {
  return (
    <div className="mb-3">
      <div className={`${labelCls} mb-2`}>{label}</div>
      <div className="grid grid-cols-5 gap-2">
        {CURRENCY_FIELDS.map(({ key, label: cLabel }) => (
          <div key={key} className="text-center">
            <label className={`${labelCls} text-center block`}>{cLabel.toUpperCase()}</label>
            <input
              className={`${inputCls} text-center`}
              type="number"
              min="0"
              value={values[key] ?? 0}
              onChange={onChange(key)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EquipmentCRUD({
  equipo = [],
  monedas = {},
  monedas_guardado = {},
  onEquipoChange,
  onMonedasChange,
  onMonedasGuardadoChange,
}) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))
  const setMoneda = k => e => onMonedasChange({ ...monedas, [k]: parseInt(e.target.value) || 0 })
  const setMonedaGuardado = k => e => onMonedasGuardadoChange({ ...monedas_guardado, [k]: parseInt(e.target.value) || 0 })

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(item) { setDraft({ ...EMPTY, ...item }); setEditingId(item.id) }
  function cancel() { setEditingId(null) }

  function togglePortando(id) {
    onEquipoChange(equipo.map(e => e.id === id ? { ...e, portando: !(e.portando ?? true) } : e))
  }

  function confirm() {
    const item = {
      ...draft,
      cantidad: parseInt(draft.cantidad) || 1,
      precio: parseInt(draft.precio) || 0,
    }
    if (editingId === 'new') {
      onEquipoChange([...equipo, { ...item, id: Date.now() }])
    } else {
      onEquipoChange(equipo.map(e => e.id === editingId ? { ...item, id: editingId } : e))
    }
    setEditingId(null)
  }

  function remove(id) { onEquipoChange(equipo.filter(e => e.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-1 mb-2">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={labelCls}>Nombre</label>
          <input className={inputCls} value={draft.nombre} onChange={set('nombre')} />
        </div>
        <div>
          <label className={labelCls}>Cantidad</label>
          <input className={inputCls} type="number" min="1" value={draft.cantidad} onChange={set('cantidad')} />
        </div>
        <div>
          <label className={labelCls}>Precio</label>
          <div className="flex gap-1">
            <input className={inputCls} type="number" min="0" value={draft.precio} onChange={set('precio')} />
            <select
              className={`${inputCls} w-auto`}
              value={draft.precio_moneda}
              onChange={set('precio_moneda')}
            >
              {MONEDA_OPTIONS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Descripción</label>
          <input className={inputCls} value={draft.descripcion} onChange={set('descripcion')} />
        </div>
        <div className="col-span-2 flex items-center gap-2 mt-1">
          <input
            type="checkbox"
            id="equipo-portando"
            checked={draft.portando !== false}
            onChange={() => setDraft(p => ({ ...p, portando: !(p.portando ?? true) }))}
          />
          <label htmlFor="equipo-portando" className={labelCls}>Portando actualmente</label>
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
      {equipo.map(item => (
        <div key={item.id}>
          {editingId === item.id ? inlineForm : (
            <div className="flex items-center gap-2 py-1 border-b border-border-base/40 text-[13px]">
              <input
                type="checkbox"
                checked={item.portando !== false}
                onChange={() => togglePortando(item.id)}
              />
              <span className="text-txt-primary font-medium flex-1">{item.nombre}</span>
              {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
              {item.descripcion && <span className="text-txt-muted text-[12px] truncate max-w-[200px]">{item.descripcion}</span>}
              {(parseInt(item.precio) > 0) && (
                <span className="text-txt-muted text-[12px]">{item.precio} {item.precio_moneda ?? 'gp'}</span>
              )}
              <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px]" onClick={() => startEdit(item)}>✎</button>
              <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(item.id)}>✕</button>
            </div>
          )}
        </div>
      ))}
      {editingId === 'new' && inlineForm}
      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1 mb-4" onClick={startAdd}>
          + Agregar ítem
        </button>
      )}

      <div className="border-t border-border-base pt-3 mt-2">
        <CurrencyGroup label="Monedas en mano" values={monedas} onChange={setMoneda} />
        <CurrencyGroup label="Monedas guardadas" values={monedas_guardado} onChange={setMonedaGuardado} />
      </div>
    </div>
  )
}
