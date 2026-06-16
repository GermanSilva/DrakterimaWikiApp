# SRD Raw Data Viewer (DM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón colapsable en la vista de detalle de cada entrada del SRD que, visible solo para el DM, muestre el JSON raw retornado por la API de open5e.

**Architecture:** Se agrega un componente `RawDataSection` a `srdCommon.jsx`. Cada uno de los 6 componentes `XxxDetail` en los tabs del SRD incluye `<RawDataSection data={...} />` como último hijo. `RawDataSection` lee `isDM` del contexto y retorna `null` si no es DM; de lo contrario renderiza un botón toggle y un bloque `<pre>` colapsable.

**Tech Stack:** React 18, Vite, Tailwind (via clases CSS custom properties), Firebase (sin cambios), sin test runner.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/srd/srdCommon.jsx` | Agregar export `RawDataSection` |
| `src/srd/SpellsTab.jsx` | Importar y usar `RawDataSection` en `SpellDetail` |
| `src/srd/MonstersTab.jsx` | Importar y usar `RawDataSection` en `MonsterDetail` |
| `src/srd/ConditionsTab.jsx` | Importar y usar `RawDataSection` en `ConditionDetail` |
| `src/srd/WeaponsTab.jsx` | Importar y usar `RawDataSection` en `WeaponDetail` |
| `src/srd/ArmorsTab.jsx` | Importar y usar `RawDataSection` en `ArmorDetail` |
| `src/srd/MagicItemsTab.jsx` | Importar y usar `RawDataSection` en `MagicItemDetail` |

---

## Task 1: Componente `RawDataSection` en `srdCommon.jsx`

**Files:**
- Modify: `src/srd/srdCommon.jsx`

- [ ] **Step 1: Agregar import de `useApp` al inicio del archivo**

En `src/srd/srdCommon.jsx`, la línea 1 actualmente importa solo de React:
```js
import { useState, useRef, useEffect } from 'react'
import { btnSecondary } from '../constants'
```
Agregar el import de `useApp`:
```js
import { useState, useRef, useEffect } from 'react'
import { btnSecondary } from '../constants'
import { useApp } from '../AppContext'
```

- [ ] **Step 2: Agregar el componente `RawDataSection` al final del archivo**

Después de la función `SRDList` (línea 95, el cierre `}`), agregar:
```jsx
export function RawDataSection({ data }) {
  const { isDM } = useApp()
  const [open, setOpen] = useState(false)
  if (!isDM) return null
  return (
    <div className="mt-8 pt-6 border-t border-border-base">
      <button className={btnSecondary} onClick={() => setOpen(o => !o)}>
        {'{ }'} {open ? 'Ocultar datos raw' : 'Ver datos raw'}
      </button>
      {open && (
        <pre className="mt-3 text-[11px] text-txt-muted font-mono overflow-x-auto bg-[#0a0a0a] border border-border-base p-4 leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/srd/srdCommon.jsx
git commit -m "feat: RawDataSection component in srdCommon"
```

---

## Task 2: Integrar `RawDataSection` en los 6 tabs

**Files:**
- Modify: `src/srd/SpellsTab.jsx`
- Modify: `src/srd/MonstersTab.jsx`
- Modify: `src/srd/ConditionsTab.jsx`
- Modify: `src/srd/WeaponsTab.jsx`
- Modify: `src/srd/ArmorsTab.jsx`
- Modify: `src/srd/MagicItemsTab.jsx`

### SpellsTab.jsx

- [ ] **Step 4: Importar `RawDataSection` en SpellsTab**

Línea 3 actual:
```js
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
```
Cambiar a:
```js
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
```

- [ ] **Step 5: Agregar `<RawDataSection>` al final de `SpellDetail`**

Dentro de `SpellDetail` (línea 54), antes del cierre `</div>` del `<div>` raíz, agregar `<RawDataSection data={spell} />`.

El cierre final de `SpellDetail` pasa de:
```jsx
      {spell.dnd_class && (
        <div className={detailSectionCls}>
          <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium mb-1">Clases</div>
          <div className="text-txt-secondary text-sm">{spell.dnd_class}</div>
        </div>
      )}
    </div>
  )
}
```
A:
```jsx
      {spell.dnd_class && (
        <div className={detailSectionCls}>
          <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium mb-1">Clases</div>
          <div className="text-txt-secondary text-sm">{spell.dnd_class}</div>
        </div>
      )}
      <RawDataSection data={spell} />
    </div>
  )
}
```

### MonstersTab.jsx

- [ ] **Step 6: Importar `RawDataSection` en MonstersTab**

Línea 3 actual:
```js
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
```
Cambiar a:
```js
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
```

- [ ] **Step 7: Agregar `<RawDataSection>` al final de `MonsterDetail`**

Dentro de `MonsterDetail`, antes del cierre `</div>` raíz (línea 121), agregar `<RawDataSection data={monster} />`.

El final de `MonsterDetail` pasa de:
```jsx
      {monster.desc && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Descripción</div>
          {monster.desc.split('\n').filter(Boolean).map((p, i) => (
            <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
          ))}
        </div>
      )}
    </div>
  )
}
```
A:
```jsx
      {monster.desc && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Descripción</div>
          {monster.desc.split('\n').filter(Boolean).map((p, i) => (
            <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
          ))}
        </div>
      )}
      <RawDataSection data={monster} />
    </div>
  )
}
```

### ConditionsTab.jsx

- [ ] **Step 8: Importar `RawDataSection` en ConditionsTab**

Línea 3 actual:
```js
import { SRDDetailHeader } from './srdCommon'
```
Cambiar a:
```js
import { SRDDetailHeader, RawDataSection } from './srdCommon'
```

- [ ] **Step 9: Agregar `<RawDataSection>` al final de `ConditionDetail`**

El cuerpo de `ConditionDetail` pasa de:
```jsx
function ConditionDetail({ cond, onBack }) {
  const paragraphs = Array.isArray(cond.desc) ? cond.desc : [cond.desc].filter(Boolean)
  return (
    <div>
      <SRDDetailHeader name={cond.name} subtitle="Condición" onBack={onBack} />
      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Efecto</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
    </div>
  )
}
```
A:
```jsx
function ConditionDetail({ cond, onBack }) {
  const paragraphs = Array.isArray(cond.desc) ? cond.desc : [cond.desc].filter(Boolean)
  return (
    <div>
      <SRDDetailHeader name={cond.name} subtitle="Condición" onBack={onBack} />
      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Efecto</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
      <RawDataSection data={cond} />
    </div>
  )
}
```

### WeaponsTab.jsx

- [ ] **Step 10: Importar `RawDataSection` en WeaponsTab**

Línea 3 actual:
```js
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
```
Cambiar a:
```js
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
```

- [ ] **Step 11: Agregar `<RawDataSection>` al final de `WeaponDetail`**

El cuerpo de `WeaponDetail` pasa de:
```jsx
function WeaponDetail({ weapon, onBack }) {
  const properties = (weapon.properties || []).map(p => p.name ?? p).join(', ')
  return (
    <div>
      <SRDDetailHeader name={weapon.name} subtitle={`Arma · ${weapon.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Daño', weapon.damage_dice ? `${weapon.damage_dice} ${weapon.damage_type ?? ''}` : null],
            ['Categoría', weapon.category],
            ['Propiedades', properties || null],
            ['Peso', weapon.weight],
            ['Precio', weapon.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```
A:
```jsx
function WeaponDetail({ weapon, onBack }) {
  const properties = (weapon.properties || []).map(p => p.name ?? p).join(', ')
  return (
    <div>
      <SRDDetailHeader name={weapon.name} subtitle={`Arma · ${weapon.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Daño', weapon.damage_dice ? `${weapon.damage_dice} ${weapon.damage_type ?? ''}` : null],
            ['Categoría', weapon.category],
            ['Propiedades', properties || null],
            ['Peso', weapon.weight],
            ['Precio', weapon.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <RawDataSection data={weapon} />
    </div>
  )
}
```

### ArmorsTab.jsx

- [ ] **Step 12: Importar `RawDataSection` en ArmorsTab**

Línea 3 actual:
```js
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
```
Cambiar a:
```js
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
```

- [ ] **Step 13: Agregar `<RawDataSection>` al final de `ArmorDetail`**

El cuerpo de `ArmorDetail` pasa de:
```jsx
function ArmorDetail({ armor, onBack }) {
  return (
    <div>
      <SRDDetailHeader name={armor.name} subtitle={`Armadura · ${armor.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['CA', formatAC(armor.armor_class)],
            ['Categoría', armor.category],
            ['Req. Fuerza', armor.strength_prerequisite ? `FUE ${armor.strength_prerequisite}` : null],
            ['Desventaja sigilo', armor.stealth_disadvantage ? 'Sí' : null],
            ['Peso', armor.weight],
            ['Precio', armor.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```
A:
```jsx
function ArmorDetail({ armor, onBack }) {
  return (
    <div>
      <SRDDetailHeader name={armor.name} subtitle={`Armadura · ${armor.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['CA', formatAC(armor.armor_class)],
            ['Categoría', armor.category],
            ['Req. Fuerza', armor.strength_prerequisite ? `FUE ${armor.strength_prerequisite}` : null],
            ['Desventaja sigilo', armor.stealth_disadvantage ? 'Sí' : null],
            ['Peso', armor.weight],
            ['Precio', armor.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <RawDataSection data={armor} />
    </div>
  )
}
```

### MagicItemsTab.jsx

- [ ] **Step 14: Importar `RawDataSection` en MagicItemsTab**

Línea 3 actual:
```js
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
```
Cambiar a:
```js
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
```

- [ ] **Step 15: Agregar `<RawDataSection>` al final de `MagicItemDetail`**

Dentro de `MagicItemDetail`, antes del cierre `</div>` raíz (línea 41), agregar `<RawDataSection data={item} />`.

El final de `MagicItemDetail` pasa de:
```jsx
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {[
            ['Rareza', item.rarity],
            ['Tipo', item.type],
            ['Sintonía', attunement],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className={sectionTitleCls}>Descripción</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
    </div>
  )
}
```
A:
```jsx
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {[
            ['Rareza', item.rarity],
            ['Tipo', item.type],
            ['Sintonía', attunement],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className={sectionTitleCls}>Descripción</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
      <RawDataSection data={item} />
    </div>
  )
}
```

- [ ] **Step 16: Commit**

```bash
git add src/srd/SpellsTab.jsx src/srd/MonstersTab.jsx src/srd/ConditionsTab.jsx src/srd/WeaponsTab.jsx src/srd/ArmorsTab.jsx src/srd/MagicItemsTab.jsx
git commit -m "feat: integrate RawDataSection in all SRD detail views"
```

---

## Task 3: Squash y commit final

- [ ] **Step 17: Squash de todos los commits de implementación en uno solo**

El SHA base (antes de esta feature) es `ae1e523` (el commit del spec doc).
Correr:
```bash
git reset --soft ae1e523
```

- [ ] **Step 18: Commit único final**

```bash
git add src/srd/srdCommon.jsx src/srd/SpellsTab.jsx src/srd/MonstersTab.jsx src/srd/ConditionsTab.jsx src/srd/WeaponsTab.jsx src/srd/ArmorsTab.jsx src/srd/MagicItemsTab.jsx
git commit -m "feat: SRD raw data viewer (DM) — botón colapsable con JSON raw en detalle de cada tab"
```
