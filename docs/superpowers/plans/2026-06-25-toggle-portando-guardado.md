# Toggle portando/guardado en equipo y armas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar campo `portando: boolean` a `pj.equipo[]` y `pj.ataques[]`, con toggle inline en los CRUD y sublistas separadas (Portando / Guardado) con subtotales en las vistas de detalle.

**Architecture:** Cambios retrocompatibles en 4 componentes. `portando !== false` como condición para "portando" (cubre `undefined` en ítems existentes). El toggle es accionable directamente desde la lista sin abrir el form. Las vistas de detalle dividen ítems en dos sublistas con subtotales; el total global sigue sumando todo. Sin cambios en seed, App, ni Firestore.

**Tech Stack:** React 18 + Tailwind (clases en `src/constants.js`). Sin test runner — verificar visualmente en `npm run dev`.

---

## Archivos a modificar

| Archivo | Qué cambia |
|---|---|
| `src/pages/pj/form/EquipmentCRUD.jsx` | `portando: true` en EMPTY; checkbox inline en lista; checkbox en form |
| `src/pages/pj/form/AttacksCRUD.jsx` | `portando: true` en EMPTY; columna checkbox en tabla; checkbox en form |
| `src/pages/pj/detail/PJEquipmentSection.jsx` | Dos sublistas + subtotales por categoría + total global |
| `src/pages/pj/detail/PJAttacksSection.jsx` | Dos bloques de tabla con cabecera de sección |
| `CLAUDE.md` | Schemas de `equipo[]` y `ataques[]` actualizados con `portando` |

---

### Task 1: EquipmentCRUD — toggle portando en lista + checkbox en form

**Files:**
- Modify: `src/pages/pj/form/EquipmentCRUD.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
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
```

---

### Task 2: AttacksCRUD — columna checkbox en tabla + checkbox en form

**Files:**
- Modify: `src/pages/pj/form/AttacksCRUD.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
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
```

---

### Task 3: PJEquipmentSection — dos sublistas + subtotales

**Files:**
- Modify: `src/pages/pj/detail/PJEquipmentSection.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
import { sectionTitleCls, detailSectionCls } from '../../../constants'

const CURRENCY = [
  { key: 'cp', label: 'Bronce' },
  { key: 'sp', label: 'Plata' },
  { key: 'ep', label: 'Electrum' },
  { key: 'gp', label: 'Oro' },
  { key: 'pp', label: 'Platino' },
]

const TO_CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }

function calcTotalCP(equipo, ataques) {
  return [...equipo, ...ataques].reduce((sum, item) => {
    const precio = parseInt(item.precio) || 0
    if (!precio) return sum
    const cantidad = parseInt(item.cantidad) || 1
    const rate = TO_CP[item.precio_moneda] ?? TO_CP.gp
    return sum + precio * cantidad * rate
  }, 0)
}

function formatTotalCP(totalCp) {
  if (totalCp === 0) return null
  const parts = []
  let rem = totalCp
  const denoms = [
    { val: 1000, label: 'pp' },
    { val: 100, label: 'gp' },
    { val: 10, label: 'sp' },
    { val: 1, label: 'cp' },
  ]
  for (const d of denoms) {
    const n = Math.floor(rem / d.val)
    if (n > 0) { parts.push(`${n} ${d.label}`); rem -= n * d.val }
  }
  return parts.join(' ')
}

function MonedasDisplay({ label, monedas }) {
  const hasAny = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)
  if (!hasAny) return null
  return (
    <div>
      <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-2">{label}</div>
      <div className="flex gap-4 flex-wrap mb-3">
        {CURRENCY.map(c => (monedas[c.key] ?? 0) > 0 && (
          <div key={c.key} className="text-center">
            <div className="font-exo text-[10px] text-txt-muted mb-0.5">{c.label}</div>
            <div className="font-exo text-[16px] font-bold text-txt-primary">{monedas[c.key]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EquipoSublist({ items, label, subtotalStr }) {
  if (items.length === 0) return null
  return (
    <div className="mb-3">
      <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">{label}</div>
      <ul className="space-y-1 mb-1">
        {items.map(item => (
          <li key={item.id} className="flex gap-3 text-[13px] text-txt-secondary">
            <span className="text-txt-primary font-medium flex-1">{item.nombre}</span>
            {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
            {item.descripcion && <span className="text-txt-muted">— {item.descripcion}</span>}
            {(parseInt(item.precio) > 0) && (
              <span className="text-txt-muted shrink-0">{item.precio} {item.precio_moneda ?? 'gp'}</span>
            )}
          </li>
        ))}
      </ul>
      {subtotalStr && (
        <div className="text-[11px] text-txt-muted">
          Subtotal: <span className="text-txt-primary font-semibold">{subtotalStr}</span>
        </div>
      )}
    </div>
  )
}

export default function PJEquipmentSection({ pj }) {
  const equipo = pj.equipo ?? []
  const monedas = pj.monedas ?? {}
  const monedas_guardado = pj.monedas_guardado ?? {}
  const hasMonedas = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)
  const hasMonedasGuardado = CURRENCY.some(c => (monedas_guardado[c.key] ?? 0) > 0)

  const portando = equipo.filter(i => i.portando !== false)
  const guardado = equipo.filter(i => i.portando === false)
  const ataquesPortando = (pj.ataques ?? []).filter(a => a.portando !== false)
  const ataquesGuardado = (pj.ataques ?? []).filter(a => a.portando === false)
  const subtotalPortandoStr = formatTotalCP(calcTotalCP(portando, ataquesPortando))
  const subtotalGuardadoStr = formatTotalCP(calcTotalCP(guardado, ataquesGuardado))
  const totalStr = formatTotalCP(calcTotalCP(equipo, pj.ataques ?? []))

  return (
    <div id="pj-section-equipo" className={detailSectionCls}>
      <div className={sectionTitleCls}>Equipo</div>
      {equipo.length > 0 && (
        <>
          <EquipoSublist items={portando} label="Portando" subtotalStr={subtotalPortandoStr} />
          <EquipoSublist items={guardado} label="Guardado" subtotalStr={subtotalGuardadoStr} />
          {totalStr && (
            <div className="text-[12px] text-txt-muted border-t border-border-base/30 pt-2 mt-1">
              Valor total del inventario: <span className="text-txt-primary font-semibold">{totalStr}</span>
            </div>
          )}
        </>
      )}
      {(hasMonedas || hasMonedasGuardado) && (
        <div className="pt-2 border-t border-border-base">
          <MonedasDisplay label="En mano" monedas={monedas} />
          <MonedasDisplay label="Guardadas" monedas={monedas_guardado} />
        </div>
      )}
    </div>
  )
}
```

---

### Task 4: PJAttacksSection — dos bloques de tabla con cabecera de sección

**Files:**
- Modify: `src/pages/pj/detail/PJAttacksSection.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
import { sectionTitleCls, detailSectionCls } from '../../../constants'

function AtaquesTable({ ataques }) {
  if (ataques.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-border-base text-txt-muted font-exo text-[10px] tracking-[0.1em] uppercase">
            <th className="text-left py-2 pr-4 font-medium">Arma</th>
            <th className="text-center py-2 px-2 font-medium">Bono</th>
            <th className="text-center py-2 px-2 font-medium">Daño</th>
            <th className="text-left py-2 px-2 font-medium">Tipo</th>
            <th className="text-left py-2 px-2 font-medium">Alcance</th>
            <th className="text-left py-2 pl-2 font-medium">Notas</th>
            <th className="text-right py-2 pl-2 font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {ataques.map(a => (
            <tr key={a.id} className="border-b border-border-base/50 text-txt-secondary">
              <td className="py-2 pr-4 text-txt-primary font-medium">{a.nombre}</td>
              <td className="text-center py-2 px-2 text-accent-dim font-semibold">{a.bono_ataque}</td>
              <td className="text-center py-2 px-2">{a.dano}</td>
              <td className="py-2 px-2 text-txt-muted">{a.tipo_dano}</td>
              <td className="py-2 px-2 text-txt-muted">{a.alcance}</td>
              <td className="py-2 pl-2 text-txt-muted">{a.notas}</td>
              <td className="py-2 pl-2 text-txt-muted text-right">
                {(parseInt(a.precio) > 0) ? `${a.precio} ${a.precio_moneda ?? 'gp'}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PJAttacksSection({ pj }) {
  const portando = (pj.ataques ?? []).filter(a => a.portando !== false)
  const guardado = (pj.ataques ?? []).filter(a => a.portando === false)

  return (
    <div id="pj-section-ataques" className={detailSectionCls}>
      <div className={sectionTitleCls}>Ataques</div>
      {portando.length > 0 && (
        <div className="mb-3">
          <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Portando</div>
          <AtaquesTable ataques={portando} />
        </div>
      )}
      {guardado.length > 0 && (
        <div>
          <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Guardado</div>
          <AtaquesTable ataques={guardado} />
        </div>
      )}
    </div>
  )
}
```

---

### Task 5: CLAUDE.md + commit único final

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar schema de `pj.ataques[]` en CLAUDE.md**

Localizar la sección `### Ataques en fichas de PJ` en `CLAUDE.md`. Encontrar el bloque JS de schema:

```js
{
  id,            // number (Date.now() al crear)
  nombre,        // string — nombre del arma
  bono_ataque,   // string libre, ej. "+5"
  dano,          // string libre, ej. "1d8+3"
  tipo_dano,     // string libre, ej. "Cortante"
  alcance,       // string libre, ej. "5 ft"
  notas,         // string libre, opcional
  precio,        // number, default 0 — precio del arma
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
}
```

Reemplazar con:

```js
{
  id,            // number (Date.now() al crear)
  nombre,        // string — nombre del arma
  bono_ataque,   // string libre, ej. "+5"
  dano,          // string libre, ej. "1d8+3"
  tipo_dano,     // string libre, ej. "Cortante"
  alcance,       // string libre, ej. "5 ft"
  notas,         // string libre, opcional
  precio,        // number, default 0 — precio del arma
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
  portando,      // boolean, default true — true = portando, false = guardado
}
```

- [ ] **Step 2: Actualizar schema de `pj.equipo[]` en CLAUDE.md**

Localizar la sección `### Equipo e inventario`. Encontrar el bloque JS de schema:

```js
{
  id,            // number (Date.now() al crear)
  nombre,        // string
  cantidad,      // number, default 1
  descripcion,   // string libre, opcional
  precio,        // number, default 0 — precio unitario
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
}
```

Reemplazar con:

```js
{
  id,            // number (Date.now() al crear)
  nombre,        // string
  cantidad,      // number, default 1
  descripcion,   // string libre, opcional
  precio,        // number, default 0 — precio unitario
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
  portando,      // boolean, default true — true = portando, false = guardado
}
```

- [ ] **Step 3: Hacer el commit único con todos los cambios**

```bash
git add src/pages/pj/form/EquipmentCRUD.jsx \
        src/pages/pj/form/AttacksCRUD.jsx \
        src/pages/pj/detail/PJEquipmentSection.jsx \
        src/pages/pj/detail/PJAttacksSection.jsx \
        CLAUDE.md \
        docs/superpowers/specs/2026-06-25-toggle-portando-guardado-design.md \
        docs/superpowers/plans/2026-06-25-toggle-portando-guardado.md

git commit -m "feat: toggle portando/guardado en equipo y armas con sublistas y subtotales"
```
