# Wiki-links con sufijo de sección — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un sufijo de letra mayúscula al ID de los wiki-links para indicar la colección destino, con tooltip estilizado al hover, badge de ID actualizado en vistas de detalle, y botón de migración automática en el Dashboard.

**Architecture:** `WikiText` solo parsea y distribuye segmentos; `WikiLink` maneja un enlace individual con hover; `Tooltip` es un componente presentacional puro. `COLLECTION_LETTER` vive en `WikiText.jsx` como fuente de verdad única e importado por todos los consumidores.

**Tech Stack:** React 18, Tailwind CSS (vía clases existentes en la app), Firebase Firestore (`writeBatch`), Lucide React.

---

## Mapa de letras de referencia

| Colección  | Letra | SECTION_LABEL       |
|------------|-------|---------------------|
| sesiones   | `S`   | Sesión              |
| pjs        | `P`   | Personaje Jugador   |
| pnjs       | `N`   | PNJ                 |
| lugares    | `G`   | Lugar               |
| facciones  | `F`   | Facción             |
| lore       | `L`   | Lore                |
| items      | `I`   | Item                |

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/components/WikiText.jsx` | Modificar | Parser de texto + exportar `COLLECTION_LETTER` y `findEntity` |
| `src/components/WikiLink.jsx` | Crear | Enlace individual con hover state (CSS group) |
| `src/components/Tooltip.jsx` | Crear | Tooltip estilizado con título + tag de sección |
| `src/pages/Dashboard.jsx` | Modificar | Botón de migración de wiki-links |
| `src/pages/PJs.jsx` | Modificar | Badge ID: `{3}` → `{3P}` |
| `src/pages/PNJs.jsx` | Modificar | Badge ID: `{3}` → `{3N}` |
| `src/pages/Sesiones.jsx` | Modificar | Badge ID: `{3}` → `{3S}` |
| `src/pages/Lugares.jsx` | Modificar | Badge ID: `{3}` → `{3G}` |
| `src/pages/Facciones.jsx` | Modificar | Badge ID: `{3}` → `{3F}` |
| `src/pages/Lore.jsx` | Modificar | Badge ID: `{3}` → `{3L}` |
| `src/pages/Items.jsx` | Modificar | Badge ID: `{3}` → `{3I}` |

---

## Task 1: Exportar COLLECTION_LETTER y findEntity desde WikiText.jsx

**Files:**
- Modify: `src/components/WikiText.jsx`

- [ ] **Step 1: Reemplazar el contenido de WikiText.jsx**

Reemplazar el archivo completo con:

```jsx
import { useApp } from '../AppContext'

export const COLLECTION_LETTER = {
  sesiones:  'S',
  pjs:       'P',
  pnjs:      'N',
  lugares:   'G',
  facciones: 'F',
  lore:      'L',
  items:     'I',
}

// letra → colección (inverso de COLLECTION_LETTER)
export const LETTER_COLLECTION = Object.fromEntries(
  Object.entries(COLLECTION_LETTER).map(([coll, letter]) => [letter, coll])
)

export function findEntity(db, id) {
  for (const coll of Object.keys(COLLECTION_LETTER)) {
    const entity = (db[coll] || []).find(e => e.id === id)
    if (entity) return { entity, page: coll }
  }
  return null
}

/**
 * Renderiza texto con soporte de wiki-links.
 * Sintaxis válida:  [[{3P}Texto del enlace]]  (número + letra mayúscula)
 * Sintaxis inválida: [[{3}Texto]]              → muestra "[[ID incorrecto]]"
 */
export default function WikiText({ text }) {
  const { db, goToDetail } = useApp()
  if (!text) return null

  // Captura formato válido {NL} e inválido {N} (sin letra)
  const segments = text.split(/(\[\[\{\d+[A-Z]?\}[^\]]*\]\])/g)

  return (
    <>
      {segments.map((seg, i) => {
        // Formato válido: [[{3P}Texto]]
        const valid = seg.match(/^\[\[\{(\d+)([A-Z])\}([^\]]*)\]\]$/)
        if (valid) {
          const id = parseInt(valid[1], 10)
          const letter = valid[2]
          const displayText = valid[3]
          const coll = LETTER_COLLECTION[letter]
          const entity = coll ? (db[coll] || []).find(e => e.id === id) : null

          if (entity) {
            // Import dinámico para evitar circular: WikiLink importa de WikiText
            // Se resuelve pasando los datos necesarios como props
            return (
              <WikiLinkInline
                key={i}
                id={id}
                letter={letter}
                displayText={displayText}
                entity={entity}
                page={coll}
                goToDetail={goToDetail}
              />
            )
          }
          // ID no encontrado en la colección indicada
          return (
            <span
              key={i}
              className="text-txt-muted border-b border-dashed border-txt-muted opacity-55 cursor-default"
              title={`Artículo #${id} no encontrado`}
            >
              {displayText}
            </span>
          )
        }

        // Formato inválido: [[{3}Texto]] sin letra
        const invalid = seg.match(/^\[\[\{(\d+)\}([^\]]*)\]\]$/)
        if (invalid) {
          return (
            <span
              key={i}
              className="font-mono text-[11px] text-txt-muted opacity-40 cursor-default"
              title="Formato de wiki-link inválido: falta la letra de sección"
            >
              [[ID incorrecto]]
            </span>
          )
        }

        // Texto plano con saltos de línea
        return seg.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>{line}{j < arr.length - 1 ? <br /> : null}</span>
        ))
      })}
    </>
  )
}

// Componente interno — evita dependencia circular con WikiLink.jsx
// WikiLink.jsx puede importar COLLECTION_LETTER directamente sin importar WikiText
import WikiLinkInline from './WikiLink'
```

> **Nota:** El import de `WikiLinkInline` está al final del archivo para evitar la dependencia circular. WikiLink importará `COLLECTION_LETTER` de WikiText, pero WikiText importará WikiLink solo después de definir esas exportaciones.

- [ ] **Step 2: Verificar en browser**

Correr `npm run dev`. Abrir la app. Si hay wiki-links en la DB con formato viejo `[[{N}texto]]`, deben mostrarse como `[[ID incorrecto]]`. Si no hay wiki-links, no hay nada que verificar visualmente aún.

- [ ] **Step 3: Commit**

```bash
git add src/components/WikiText.jsx
git commit -m "refactor: exportar COLLECTION_LETTER y findEntity, nuevo parser estricto en WikiText"
```

---

## Task 2: Crear Tooltip.jsx

**Files:**
- Create: `src/components/Tooltip.jsx`

- [ ] **Step 1: Crear el archivo**

```jsx
import { Tag } from './Shared'

/**
 * Tooltip estilizado para wiki-links.
 * Requiere que el elemento padre tenga la clase `group` y `relative`.
 * Props:
 *   title   — nombre del artículo
 *   section — etiqueta de sección (ej. "Lugar", "PNJ")
 */
export default function Tooltip({ title, section }) {
  return (
    <span
      className={[
        'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
        'pointer-events-none select-none',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        'bg-bg-card border border-border-light',
        'px-3 py-2 flex flex-col items-start gap-1.5',
        'shadow-[0_4px_16px_rgba(0,0,0,0.5)]',
        'min-w-max max-w-[200px]',
      ].join(' ')}
    >
      <span className="font-exo text-[12px] font-semibold text-txt-primary whitespace-nowrap leading-tight">
        {title}
      </span>
      <Tag cls="neutral" text={section} />
    </span>
  )
}
```

- [ ] **Step 2: Verificar que no hay errores de compilación**

```bash
npm run build 2>&1 | tail -20
```

Esperado: sin errores. (El componente no está usado aún.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Tooltip.jsx
git commit -m "feat: agregar componente Tooltip para wiki-links"
```

---

## Task 3: Crear WikiLink.jsx

**Files:**
- Create: `src/components/WikiLink.jsx`

- [ ] **Step 1: Crear el archivo**

```jsx
import { useApp } from '../AppContext'
import Tooltip from './Tooltip'

const SECTION_LABEL = {
  S: 'Sesión',
  P: 'Personaje Jugador',
  N: 'PNJ',
  G: 'Lugar',
  F: 'Facción',
  L: 'Lore',
  I: 'Item',
}

/**
 * Enlace individual de wiki-link con tooltip al hover.
 * Props:
 *   id          — id numérico del artículo
 *   letter      — letra de sección ('P', 'N', 'G', etc.)
 *   displayText — texto visible del enlace
 *   entity      — objeto de la entidad destino
 *   page        — nombre de la colección ('pjs', 'lugares', etc.)
 *   goToDetail  — función de navegación del contexto
 */
export default function WikiLink({ id, letter, displayText, entity, page, goToDetail }) {
  const title = entity.nombre || entity.titulo || `#${id}`
  const section = SECTION_LABEL[letter] || letter

  return (
    <span className="group relative inline-block">
      <span
        className="text-accent-bright cursor-pointer border-b border-dashed border-accent-dim hover:text-accent hover:border-b-solid transition-colors"
        onClick={e => { e.stopPropagation(); goToDetail(page, id) }}
      >
        {displayText}
      </span>
      <Tooltip title={title} section={section} />
    </span>
  )
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npm run build 2>&1 | tail -20
```

Esperado: sin errores.

- [ ] **Step 3: Verificar en browser**

Correr `npm run dev`. Crear una entrada de prueba con un wiki-link válido tipo `[[{1P}Nombre]]` (asumiendo que existe un PJ con id=1). El link debe aparecer en color accent, con tooltip al hover mostrando el nombre del PJ y el tag "Personaje Jugador".

- [ ] **Step 4: Commit**

```bash
git add src/components/WikiLink.jsx
git commit -m "feat: agregar componente WikiLink con tooltip hover"
```

---

## Task 4: Actualizar badges de ID en las 7 páginas de detalle

**Files:**
- Modify: `src/pages/PJs.jsx`, `src/pages/PNJs.jsx`, `src/pages/Sesiones.jsx`, `src/pages/Lugares.jsx`, `src/pages/Facciones.jsx`, `src/pages/Lore.jsx`, `src/pages/Items.jsx`

- [ ] **Step 1: Actualizar PJs.jsx**

Agregar el import al inicio del archivo (junto a los otros imports):
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Luego reemplazar el badge existente:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${pj.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${pj.id}${COLLECTION_LETTER['pjs']}}`}</span>
```

- [ ] **Step 2: Actualizar PNJs.jsx**

Agregar import:
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Reemplazar badge:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${pnj.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${pnj.id}${COLLECTION_LETTER['pnjs']}}`}</span>
```

- [ ] **Step 3: Actualizar Sesiones.jsx**

Agregar import:
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Reemplazar badge:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${sesion.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${sesion.id}${COLLECTION_LETTER['sesiones']}}`}</span>
```

- [ ] **Step 4: Actualizar Lugares.jsx**

Agregar import:
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Reemplazar badge:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${lugar.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${lugar.id}${COLLECTION_LETTER['lugares']}}`}</span>
```

- [ ] **Step 5: Actualizar Facciones.jsx**

Agregar import:
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Reemplazar badge:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${faccion.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${faccion.id}${COLLECTION_LETTER['facciones']}}`}</span>
```

- [ ] **Step 6: Actualizar Lore.jsx**

Agregar import:
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Reemplazar badge:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${entrada.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${entrada.id}${COLLECTION_LETTER['lore']}}`}</span>
```

- [ ] **Step 7: Actualizar Items.jsx**

Agregar import:
```jsx
import { COLLECTION_LETTER } from '../components/WikiText'
```

Reemplazar badge:
```jsx
// ANTES:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${item.id}}`}</span>

// DESPUÉS:
<span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${item.id}${COLLECTION_LETTER['items']}}`}</span>
```

- [ ] **Step 8: Verificar en browser**

Correr `npm run dev`. Ir como DM a cualquier vista de detalle. El badge de ID debe mostrar, por ejemplo, `{3P}` en PJs, `{5G}` en Lugares, etc.

- [ ] **Step 9: Commit**

```bash
git add src/pages/PJs.jsx src/pages/PNJs.jsx src/pages/Sesiones.jsx src/pages/Lugares.jsx src/pages/Facciones.jsx src/pages/Lore.jsx src/pages/Items.jsx
git commit -m "feat: badges de ID muestran sufijo de sección ({3P}, {5G}, etc.)"
```

---

## Task 5: Botón de migración en Dashboard.jsx

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Agregar imports necesarios al inicio de Dashboard.jsx**

Agregar al bloque de imports existente:
```jsx
import { useState } from 'react'
import { firestore } from '../firebase'
import { writeBatch, doc } from 'firebase/firestore'
import { COLLECTION_LETTER, findEntity } from '../components/WikiText'
```

- [ ] **Step 2: Definir MIGRATION_FIELDS y la función migrateWikiLinks**

Agregar justo después de los imports, antes de `const STAT_ITEMS`:

```jsx
const MIGRATION_FIELDS = {
  sesiones:  ['resumen', 'secreto'],
  pjs:       ['trasfondo', 'notas'],
  pnjs:      ['descripcion', 'notas'],
  lugares:   ['descripcion', 'notas'],
  facciones: ['descripcion', 'notas'],
  lore:      ['contenido', 'notas'],
  items:     ['descripcion', 'notas'],
}

const OLD_LINK_PATTERN = /\[\[\{(\d+)\}([^\]]*)\]\]/g

async function migrateWikiLinks(db, showToast) {
  let migrated = 0
  let unresolved = 0
  const batch = writeBatch(firestore)
  let batchHasChanges = false

  for (const [coll, fields] of Object.entries(MIGRATION_FIELDS)) {
    for (const entity of db[coll] || []) {
      let changed = false
      const updated = { ...entity }

      for (const field of fields) {
        if (!updated[field]) continue
        updated[field] = updated[field].replace(OLD_LINK_PATTERN, (match, idStr, text) => {
          const id = parseInt(idStr, 10)
          const found = findEntity(db, id)
          if (found) {
            migrated++
            changed = true
            return `[[{${id}${COLLECTION_LETTER[found.page]}}${text}]]`
          }
          console.warn(`Wiki-link migration: ID ${id} no encontrado en ninguna colección`)
          unresolved++
          return match
        })
      }

      if (changed) {
        batch.set(doc(firestore, coll, String(entity.id)), updated)
        batchHasChanges = true
      }
    }
  }

  if (batchHasChanges) await batch.commit()

  const msg = unresolved > 0
    ? `${migrated} enlaces migrados. ${unresolved} sin resolver (ver consola).`
    : migrated > 0
      ? `${migrated} enlaces migrados correctamente.`
      : 'No se encontraron enlaces para migrar.'
  showToast(msg)
}
```

- [ ] **Step 3: Agregar estado y botón en el componente Dashboard**

En la función `Dashboard`, agregar `showToast` al destructuring del contexto y un estado de loading:

```jsx
// ANTES:
const { db, navigate, goToDetail, isDM, currentPlayer } = useApp()

// DESPUÉS:
const { db, navigate, goToDetail, isDM, currentPlayer, showToast } = useApp()
const [migrating, setMigrating] = useState(false)
```

Luego, al final del bloque `{isDM && nextSesion && (...)}` y antes del primer `<Divider>`, agregar el botón solo visible para DM:

```jsx
{isDM && (
  <div className="mb-6 flex justify-end">
    <button
      className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-muted border border-border-light hover:border-accent-dim hover:text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed"
      disabled={migrating}
      onClick={async () => {
        setMigrating(true)
        await migrateWikiLinks(db, showToast)
        setMigrating(false)
      }}
    >
      {migrating ? 'Migrando…' : 'Migrar wiki-links'}
    </button>
  </div>
)}
```

- [ ] **Step 4: Verificar que showToast está expuesto en el contexto**

Buscar en `src/App.jsx` que `showToast` esté incluido en el value del contexto:

```bash
grep -n "showToast" src/App.jsx
```

Esperado: debe aparecer en el objeto `value` del `AppContext.Provider`. Si no está, agregarlo al objeto value en `App.jsx`.

- [ ] **Step 5: Verificar en browser**

Correr `npm run dev`. Ir al Dashboard como DM. Debe aparecer el botón "Migrar wiki-links" en la esquina inferior derecha sobre las secciones de lore. Al hacer click debe mostrar un toast con el resultado.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat: botón de migración de wiki-links al nuevo formato en Dashboard"
```

---

## Self-Review

**Spec coverage:**
- ✅ Nuevo formato `{3P}` con letra mayúscula — Task 1 (parser), Task 3 (WikiLink)
- ✅ Formato inválido `{3}` → `[[ID incorrecto]]` — Task 1 (WikiText parser)
- ✅ Tooltip estilizado con título + tag de sección — Tasks 2 y 3
- ✅ Badge de ID actualizado en 7 páginas de detalle — Task 4
- ✅ Botón de migración en Dashboard, solo DM — Task 5
- ✅ `COLLECTION_LETTER` fuente de verdad única — Task 1, importado en Tasks 4 y 5
- ✅ Toast con conteo de migrados y sin resolver — Task 5

**Placeholder scan:** Sin TBD ni TODO. Todos los pasos tienen código completo.

**Type consistency:**
- `findEntity(db, id)` definido en Task 1, usado en Task 5 — consistente.
- `COLLECTION_LETTER` exportado en Task 1, importado en Tasks 4 y 5 — consistente.
- `WikiLink` props: `{ id, letter, displayText, entity, page, goToDetail }` — definidos en Task 3, pasados desde Task 1 — consistente.
- `Tooltip` props: `{ title, section }` — definidos en Task 2, usados en Task 3 — consistente.
