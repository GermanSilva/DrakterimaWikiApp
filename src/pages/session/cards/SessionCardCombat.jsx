import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../../../AppContext'
import { labelCls, inputCls, btnPrimary, btnSecondary } from '../../../constants'
import SessionCardShell from './SessionCardShell'

const EMPTY_CUSTOM = { nombre: '', iniciativa: 0, hp_max: 0, ac: 0, velocidad: 0, bando: 'enemigo' }
const ALL_PJS_VALUE = '__all__'

const BORDER_COLOR_CLS = {
  pj: 'border-l-purple-500',
  enemigo: 'border-l-red-500',
  aliado: 'border-l-sky-400',
}

function borderColorCls(c) {
  if (c.tipo === 'pj') return BORDER_COLOR_CLS.pj
  return BORDER_COLOR_CLS[c.bando] ?? BORDER_COLOR_CLS.enemigo
}

// `entry.combatants` lives on this card's own object inside `layout.cards[]`,
// same pattern as SessionCardNotes' `entry.text` — no separate Firestore doc,
// no `db.pjs` mutation. Combatant fields are cached at add-time and never
// re-synced with the source PJ afterwards (by design).
export default function SessionCardCombat({ db, layout, entry, onRemove }) {
  const { saveSessionScreen } = useApp()
  const [combatants, setCombatants] = useState(entry?.combatants ?? [])
  const [selectedPjId, setSelectedPjId] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [customForm, setCustomForm] = useState(EMPTY_CUSTOM)

  useEffect(() => { setCombatants(entry?.combatants ?? []) }, [entry?.combatants])

  function persist(next) {
    if (!layout || !entry) return
    const cards = (layout.cards ?? []).map(c => (c.id === entry.id ? { ...c, combatants: next } : c))
    saveSessionScreen({ ...layout, cards })
  }

  const pjs = db?.pjs ?? []
  const availablePjs = pjs.filter(pj => !combatants.some(c => c.tipo === 'pj' && c.pj_id === pj.id))

  function buildPjCombatant(pj) {
    return {
      tipo: 'pj',
      pj_id: pj.id,
      nombre: pj.nombre,
      iniciativa: 0,
      hp_actual: pj.stat_hp_current ?? pj.stat_hp ?? 0,
      hp_max: pj.stat_hp ?? 0,
      hp_temp: pj.stat_hp_temp ?? 0,
      ac: pj.stat_ac ?? 0,
      ac_temp: pj.stat_ac_temp ?? 0,
      velocidad: pj.stat_speed ?? 0,
    }
  }

  function addPj() {
    if (!selectedPjId) return
    if (selectedPjId === ALL_PJS_VALUE) {
      if (availablePjs.length === 0) return
      const additions = availablePjs.map((pj, i) => ({ id: Date.now() + i, ...buildPjCombatant(pj) }))
      const next = [...combatants, ...additions]
      setCombatants(next)
      persist(next)
      setSelectedPjId('')
      return
    }
    const pj = pjs.find(p => p.id === Number(selectedPjId))
    if (!pj) return
    const next = [...combatants, { id: Date.now(), ...buildPjCombatant(pj) }]
    setCombatants(next)
    persist(next)
    setSelectedPjId('')
  }

  function addCustom() {
    if (!customForm.nombre.trim()) return
    const hp_max = parseInt(customForm.hp_max) || 0
    const next = [...combatants, {
      id: Date.now(),
      tipo: 'custom',
      bando: customForm.bando === 'aliado' ? 'aliado' : 'enemigo',
      nombre: customForm.nombre.trim(),
      iniciativa: parseInt(customForm.iniciativa) || 0,
      hp_actual: hp_max,
      hp_max,
      hp_temp: 0,
      ac: parseInt(customForm.ac) || 0,
      ac_temp: 0,
      velocidad: parseInt(customForm.velocidad) || 0,
    }]
    setCombatants(next)
    persist(next)
    setCustomForm(EMPTY_CUSTOM)
    setAddingCustom(false)
  }

  function updateField(id, field, value) {
    setCombatants(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)))
  }

  function persistCurrent() {
    persist(combatants)
  }

  function removeCombatant(id) {
    const next = combatants.filter(c => c.id !== id)
    setCombatants(next)
    persist(next)
  }

  function sortByIniciativa() {
    const next = [...combatants].sort((a, b) => Number(b.iniciativa) - Number(a.iniciativa))
    setCombatants(next)
    persist(next)
  }

  function sortByHpActual() {
    const next = [...combatants].sort((a, b) => Number(b.hp_actual) - Number(a.hp_actual))
    setCombatants(next)
    persist(next)
  }

  return (
    <SessionCardShell title="Combate" onRemove={onRemove}>
      {combatants.length === 0 ? (
        <div className="text-[13px] text-txt-muted mb-3">Sin combatientes. Agregá un PJ o un enemigo/aliado.</div>
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <button type="button" className={btnSecondary} onClick={sortByIniciativa}>Ordenar por iniciativa</button>
            <button type="button" className={btnSecondary} onClick={sortByHpActual}>Ordenar por HP actual</button>
          </div>
          <div className="space-y-2 mb-3">
            {combatants.map(c => (
              <div key={c.id} className={`border border-border-base border-l-[3px] p-2 ${borderColorCls(c)}`}>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  {c.tipo === 'custom' ? (
                    <input
                      className={`${inputCls} font-exo text-[12px] font-semibold uppercase tracking-[0.05em]`}
                      value={c.nombre}
                      onChange={e => updateField(c.id, 'nombre', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  ) : (
                    <span className="font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.05em]">{c.nombre}</span>
                  )}
                  <button
                    type="button"
                    className="text-txt-muted hover:text-accent transition-colors p-1"
                    title="Quitar combatiente"
                    onClick={() => removeCombatant(c.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  <div>
                    <label className={labelCls}>Iniciativa</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.iniciativa}
                      onChange={e => updateField(c.id, 'iniciativa', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>HP Actual</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.hp_actual}
                      onChange={e => updateField(c.id, 'hp_actual', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>HP Máximo</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.hp_max}
                      onChange={e => updateField(c.id, 'hp_max', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>HP Temporal</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.hp_temp}
                      onChange={e => updateField(c.id, 'hp_temp', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>AC</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.ac}
                      onChange={e => updateField(c.id, 'ac', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>AC Temporal</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.ac_temp}
                      onChange={e => updateField(c.id, 'ac_temp', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Velocidad</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={c.velocidad}
                      onChange={e => updateField(c.id, 'velocidad', e.target.value)}
                      onBlur={persistCurrent}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-end gap-2 mb-3">
        <div className="flex-1">
          <label className={labelCls}>Agregar PJ</label>
          <select className={inputCls} value={selectedPjId} onChange={e => setSelectedPjId(e.target.value)}>
            <option value="">Seleccionar...</option>
            {availablePjs.length > 0 && <option value={ALL_PJS_VALUE}>— Agregar todos —</option>}
            {availablePjs.map(pj => <option key={pj.id} value={pj.id}>{pj.nombre}</option>)}
          </select>
        </div>
        <button type="button" className={btnSecondary} onClick={addPj} disabled={!selectedPjId}>Agregar</button>
      </div>

      {addingCustom ? (
        <div className="border border-border-base p-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="col-span-2">
              <label className={labelCls}>Nombre</label>
              <input
                className={inputCls}
                value={customForm.nombre}
                onChange={e => setCustomForm(f => ({ ...f, nombre: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Bando</label>
              <select
                className={inputCls}
                value={customForm.bando}
                onChange={e => setCustomForm(f => ({ ...f, bando: e.target.value }))}
              >
                <option value="enemigo">Enemigo</option>
                <option value="aliado">Aliado</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Iniciativa</label>
              <input
                className={inputCls}
                type="number"
                value={customForm.iniciativa}
                onChange={e => setCustomForm(f => ({ ...f, iniciativa: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>HP Máximo</label>
              <input
                className={inputCls}
                type="number"
                value={customForm.hp_max}
                onChange={e => setCustomForm(f => ({ ...f, hp_max: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>AC</label>
              <input
                className={inputCls}
                type="number"
                value={customForm.ac}
                onChange={e => setCustomForm(f => ({ ...f, ac: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>Velocidad</label>
              <input
                className={inputCls}
                type="number"
                value={customForm.velocidad}
                onChange={e => setCustomForm(f => ({ ...f, velocidad: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={addCustom}>Guardar</button>
            <button type="button" className={btnSecondary} onClick={() => { setAddingCustom(false); setCustomForm(EMPTY_CUSTOM) }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className={btnSecondary} onClick={() => setAddingCustom(true)}>+ Agregar enemigo/aliado</button>
      )}
    </SessionCardShell>
  )
}
