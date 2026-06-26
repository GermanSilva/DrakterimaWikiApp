# Armas: Precio + Totalizador Combinado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar precio a cada arma del PJ y sumar armas + equipo en el totalizador de inventario.

**Architecture:** Cambios retrocompatibles en tres componentes. `AttacksCRUD` y `PJAttacksSection` agregan campo/columna de precio. `PJEquipmentSection` actualiza `calcTotalCP` para recibir `ataques` además de `equipo` — ya tiene acceso a `pj.ataques` via el prop `pj` existente, sin cambios de interfaz.

**Tech Stack:** React 18 + Tailwind (clases en `constants.js`)

---

## Archivos a modificar

| Archivo | Qué cambia |
|---|---|
| `src/pages/pj/form/AttacksCRUD.jsx` | Precio en form + columna "Valor" en tabla |
| `src/pages/pj/detail/PJAttacksSection.jsx` | Columna "Valor" en tabla de detalle |
| `src/pages/pj/detail/PJEquipmentSection.jsx` | `calcTotalCP` suma equipo + ataques; label actualizado |
| `CLAUDE.md` | Schema de ataques actualizado |

---

### Task 1: AttacksCRUD — precio en form + columna Valor en tabla

**Files:**
- Modify: `src/pages/pj/form/AttacksCRUD.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = { nombre: '', bono_ataque: '', dano: '', tipo_dano: '', alcance: '', notas: '', precio: 0, precio_moneda: 'gp' }
const MONEDA_OPTIONS = ['cp', 'sp', 'ep', 'gp', 'pp']

export default function AttacksCRUD({ ataques = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(a) { setDraft({ ...EMPTY, ...a }); setEditingId(a.id) }
  function cancel() { setEditingId(null) }

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
                    <td colSpan={7} className={inlineFormCls}>
                      {inlineFormContent}
                    </td>
                  ) : (
                    <>
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

### Task 2: PJAttacksSection — columna Valor en tabla de detalle

**Files:**
- Modify: `src/pages/pj/detail/PJAttacksSection.jsx`

- [ ] **Step 1: Reemplazar el archivo completo con esta implementación**

```jsx
import { sectionTitleCls, detailSectionCls } from '../../../constants'

export default function PJAttacksSection({ pj }) {
  return (
    <div id="pj-section-ataques" className={detailSectionCls}>
      <div className={sectionTitleCls}>Ataques</div>
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
            {(pj.ataques ?? []).map(a => (
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
    </div>
  )
}
```

---

### Task 3: PJEquipmentSection — totalizador combinado equipo + armas

**Files:**
- Modify: `src/pages/pj/detail/PJEquipmentSection.jsx`

El archivo actual tiene `calcTotalCP(equipo)`. Se deben hacer dos cambios puntuales:

- [ ] **Step 1: Actualizar `calcTotalCP` para aceptar y combinar equipo + ataques**

Localizar la función actual:
```js
function calcTotalCP(equipo) {
  return equipo.reduce((sum, item) => {
    const precio = parseInt(item.precio) || 0
    if (!precio) return sum
    const cantidad = parseInt(item.cantidad) || 1
    const rate = TO_CP[item.precio_moneda] ?? TO_CP.gp
    return sum + precio * cantidad * rate
  }, 0)
}
```

Reemplazarla con:
```js
function calcTotalCP(equipo, ataques) {
  return [...equipo, ...ataques].reduce((sum, item) => {
    const precio = parseInt(item.precio) || 0
    if (!precio) return sum
    const cantidad = parseInt(item.cantidad) || 1
    const rate = TO_CP[item.precio_moneda] ?? TO_CP.gp
    return sum + precio * cantidad * rate
  }, 0)
}
```

Nota: las armas no tienen campo `cantidad`, así que `parseInt(item.cantidad) || 1` da 1 por defecto — correcto para armas (precio unitario × 1).

- [ ] **Step 2: Actualizar la llamada a `calcTotalCP` en el componente principal**

Localizar:
```js
const totalStr = formatTotalCP(calcTotalCP(equipo))
```

Reemplazar con:
```js
const totalStr = formatTotalCP(calcTotalCP(equipo, pj.ataques ?? []))
```

- [ ] **Step 3: Actualizar el label del totalizador**

Localizar:
```jsx
Valor total: <span className="text-txt-primary font-semibold">{totalStr}</span>
```

Reemplazar con:
```jsx
Valor total del inventario: <span className="text-txt-primary font-semibold">{totalStr}</span>
```

---

### Task 4: CLAUDE.md + commit único final

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar la sección de ataques en CLAUDE.md**

Localizar en `CLAUDE.md` la sección `### Equipo e inventario` (recién agregada). Inmediatamente ANTES de esa sección, insertar:

```markdown
### Ataques en fichas de PJ (`PJAttacksSection`, `AttacksCRUD`)

Cada entrada en `pj.ataques[]`:

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

El precio de las armas se incluye en el totalizador "Valor total del inventario" de `PJEquipmentSection`. Las armas no tienen campo `cantidad` — se cuentan como 1 unidad en el total.

```

- [ ] **Step 2: Hacer el commit único con todos los cambios**

```bash
git add src/pages/pj/form/AttacksCRUD.jsx src/pages/pj/detail/PJAttacksSection.jsx src/pages/pj/detail/PJEquipmentSection.jsx CLAUDE.md docs/superpowers/specs/2026-06-25-armas-precio-totalizador-combinado-design.md docs/superpowers/plans/2026-06-25-armas-precio-totalizador-combinado.md

git commit -m "feat: precio en armas y totalizador combinado de inventario (equipo + armas)"
```
