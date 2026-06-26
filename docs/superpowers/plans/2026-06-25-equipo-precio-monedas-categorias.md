# Equipo: Precio + Categorías de Monedas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar precio unitario (número + moneda) a cada ítem de equipo con totalizador automático, y dividir el registro de monedas en "En mano" y "Guardadas".

**Architecture:** Cambios retrocompatibles en tres componentes: `EquipmentCRUD` (form), `PJInventoryTab` (prop threading), `PJEquipmentSection` (display). Sin cambios en seed, App, ni Firestore schema — los nuevos campos son opcionales con defaults.

**Tech Stack:** React 18 + Tailwind (clases en `constants.js`)

---

## Archivos a modificar

| Archivo | Qué cambia |
|---|---|
| `src/pages/pj/form/EquipmentCRUD.jsx` | Agrega campos `precio`/`precio_moneda` al form; divide sección monedas en "En mano" y "Guardadas" |
| `src/pages/pj/form/PJInventoryTab.jsx` | Pasa props `monedas_guardado` y `onMonedasGuardadoChange` a `EquipmentCRUD` |
| `src/pages/pj/detail/PJEquipmentSection.jsx` | Muestra precio por ítem, totalizador de valor, dos secciones de monedas |
| `CLAUDE.md` | Actualiza schema de equipo y monedas |

No se tocan: `seed.js`, `App.jsx`, `helpers.js`, `FormModal.jsx`.

---

### Task 1: EquipmentCRUD — precio en form + split de monedas

**Files:**
- Modify: `src/pages/pj/form/EquipmentCRUD.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = { nombre: '', cantidad: 1, descripcion: '', precio: 0, precio_moneda: 'gp' }
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

### Task 2: PJInventoryTab — prop threading de monedas_guardado

**Files:**
- Modify: `src/pages/pj/form/PJInventoryTab.jsx` (línea 40-45)

- [ ] **Step 1: Agregar las dos props nuevas al bloque `<EquipmentCRUD>`**

Localizar este bloque (líneas ~40-45):
```jsx
<EquipmentCRUD
  equipo={f.equipo}
  monedas={f.monedas}
  onEquipoChange={items => setF(p => ({ ...p, equipo: items }))}
  onMonedasChange={m => setF(p => ({ ...p, monedas: m }))}
/>
```

Reemplazarlo con:
```jsx
<EquipmentCRUD
  equipo={f.equipo}
  monedas={f.monedas}
  monedas_guardado={f.monedas_guardado}
  onEquipoChange={items => setF(p => ({ ...p, equipo: items }))}
  onMonedasChange={m => setF(p => ({ ...p, monedas: m }))}
  onMonedasGuardadoChange={m => setF(p => ({ ...p, monedas_guardado: m }))}
/>
```

---

### Task 3: PJEquipmentSection — precio por ítem, totalizador, dos secciones de monedas

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

function calcTotalCP(equipo) {
  return equipo.reduce((sum, item) => {
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

export default function PJEquipmentSection({ pj }) {
  const equipo = pj.equipo ?? []
  const monedas = pj.monedas ?? {}
  const monedas_guardado = pj.monedas_guardado ?? {}
  const hasMonedas = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)
  const hasMonedasGuardado = CURRENCY.some(c => (monedas_guardado[c.key] ?? 0) > 0)
  const totalStr = formatTotalCP(calcTotalCP(equipo))

  return (
    <div id="pj-section-equipo" className={detailSectionCls}>
      <div className={sectionTitleCls}>Equipo</div>
      {equipo.length > 0 && (
        <>
          <ul className="space-y-1 mb-2">
            {equipo.map(item => (
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
          {totalStr && (
            <div className="text-[12px] text-txt-muted mb-4">
              Valor total: <span className="text-txt-primary font-semibold">{totalStr}</span>
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

### Task 4: CLAUDE.md + commit único final

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar el schema de equipo en CLAUDE.md**

Localizar la sección de hechizos en CLAUDE.md que tiene el schema JS. Debajo de la sección `### Hechizos en fichas de PJ`, hay una mención de equipo. En realidad el equipo no tiene un schema explícito documentado actualmente — agregarlo.

Buscar la sección de `PJInventoryTab` o el bloque que describe el equipo. Agregar después de la sección de Hechizos una nueva sección:

```markdown
### Equipo e inventario (`PJEquipmentSection`, `EquipmentCRUD`)

Cada entrada en `pj.equipo[]`:

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

Monedas del PJ:

```js
pj.monedas          // { cp, sp, ep, gp, pp } — dinero en mano
pj.monedas_guardado // { cp, sp, ep, gp, pp } — dinero guardado/banco (campo nuevo, opcional)
```

`PJEquipmentSection` muestra precio por ítem cuando `precio > 0`, y un totalizador (`Valor total: X gp Y sp`) que convierte todos los precios × cantidad a cobre usando tasas D&D 5e estándar: 1pp=1000cp, 1gp=100cp, 1ep=50cp, 1sp=10cp. El totalizador omite electrum en el output para claridad.
```

- [ ] **Step 2: Hacer el commit único con todos los cambios**

```bash
git add src/pages/pj/form/EquipmentCRUD.jsx \
        src/pages/pj/form/PJInventoryTab.jsx \
        src/pages/pj/detail/PJEquipmentSection.jsx \
        CLAUDE.md \
        docs/superpowers/specs/2026-06-25-equipo-precio-monedas-categorias-design.md \
        docs/superpowers/plans/2026-06-25-equipo-precio-monedas-categorias.md

git commit -m "feat: precio en items de equipo y categorías de monedas (en mano / guardadas)"
```
