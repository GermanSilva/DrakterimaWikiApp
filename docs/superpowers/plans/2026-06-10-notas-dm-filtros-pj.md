# Filtros por PJ en vista Notas (DM) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una barra de filtros en la vista DM de `Notas.jsx` que permita ver las notas de un PJ específico o todas juntas.

**Architecture:** Un único `useState(null)` en `Notas.jsx` controla el filtro activo (`null` = Todas). La barra de botones se renderiza a partir del array `grouped` ya existente. El array `displayed` filtra `grouped` según `selectedPjId`. No hay cambios fuera de `Notas.jsx`.

**Tech Stack:** React 18, Tailwind CSS (clases custom CSS), Lucide icons.

> **Nota:** No hay test runner configurado en el proyecto (`npm run test` no existe). Los pasos de testing son manuales con el dev server.

---

### Task 1: Agregar filtros por PJ en la vista DM de Notas.jsx

**Files:**
- Modify: `src/pages/Notas.jsx`

- [ ] **Step 1: Agregar `useState` y la lógica de filtrado**

Reemplazar el bloque `if (isDM)` actual en `src/pages/Notas.jsx` con esta versión que incluye el estado y el filtrado:

```jsx
// Al inicio del componente Notas, ANTES del bloque if (isDM):
// Agregar el import de useState al inicio del archivo:
import { useState } from 'react'

// Dentro de export default function Notas(), antes de los returns:
const [selectedPjId, setSelectedPjId] = useState(null)
```

El archivo actualmente no importa `useState`. Verificar la línea 1 — solo tiene `import { useApp } from '../AppContext'` y `import { NotebookPen } from 'lucide-react'`. Agregar `useState` al import de React:

```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { NotebookPen } from 'lucide-react'
```

- [ ] **Step 2: Reemplazar el bloque `if (isDM)` completo**

Reemplazar desde `if (isDM) {` hasta el `}` de cierre de ese bloque (líneas 72–103 actuales) con:

```jsx
  if (isDM) {
    const grouped = (db.pjs || [])
      .map(pj => ({ pj, notes: activeNotes.filter(n => n.pj_id === pj.id) }))
      .filter(g => g.notes.length > 0)

    const displayed = selectedPjId === null
      ? grouped
      : grouped.filter(g => g.pj.id === selectedPjId)

    return (
      <div>
        <PageHeader />
        {grouped.length === 0 ? (
          <div className="text-txt-muted text-[13px] italic mt-8">
            No hay notas de jugadores todavía.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                  selectedPjId === null
                    ? 'border-accent bg-accent/10 text-txt-primary'
                    : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                }`}
                onClick={() => setSelectedPjId(null)}
              >
                Todas
              </button>
              {grouped.map(({ pj }) => (
                <button
                  key={pj.id}
                  className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                    selectedPjId === pj.id
                      ? 'border-accent bg-accent/10 text-txt-primary'
                      : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                  }`}
                  onClick={() => setSelectedPjId(pj.id)}
                >
                  {pj.nombre}
                </button>
              ))}
            </div>
            {displayed.map(({ pj, notes }) => (
              <div key={pj.id} className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <NotebookPen size={13} className="text-txt-muted" />
                  <span className="font-exo text-[11px] font-semibold tracking-[0.2em] text-txt-muted uppercase">
                    {pj.nombre}{pj.jugador ? ` · ${pj.jugador}` : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {notes.map(note => (
                    <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }
```

- [ ] **Step 3: Mover la declaración de `grouped` fuera del bloque**

Verificar que la declaración `const grouped = ...` dentro del bloque `if (isDM)` no quede duplicada. El `grouped` declarado dentro del bloque `if (isDM)` en el Step 2 ya es correcto — `selectedPjId` se declara antes del bloque, lo cual es válido porque `useState` se llama incondicionalmente al inicio de la función.

Confirmar que el estado `const [selectedPjId, setSelectedPjId] = useState(null)` está declarado **antes** de cualquier `if` en el cuerpo de `Notas()`, para cumplir la regla de hooks de React.

El orden correcto en `export default function Notas()`:

```jsx
export default function Notas() {
  const { db, isDM, currentPlayer, goToDetail } = useApp()
  const [selectedPjId, setSelectedPjId] = useState(null)   // <-- AQUÍ, antes de los ifs

  const activeNotes = (db.player_notes || []).filter(n => n.text?.trim())

  if (!isDM && !currentPlayer) { ... }

  if (isDM) { ... }  // usa selectedPjId y setSelectedPjId

  // vista jugador...
}
```

- [ ] **Step 4: Verificar en el dev server**

```bash
npm run dev
```

Pasos manuales:
1. Iniciar sesión como DM.
2. Navegar a "Notas".
3. Verificar que aparece la barra con botón "Todas" + un botón por PJ que tenga notas.
4. "Todas" activo por defecto (borde accent, fondo accent/10).
5. Hacer clic en un PJ → solo sus notas visibles, encabezado con nombre · jugador intacto.
6. Hacer clic en "Todas" → todos los grupos reaparecen.
7. Si no hay notas, la barra de filtros no debe aparecer (el mensaje vacío aparece en su lugar).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Notas.jsx
git commit -m "feat: filtros por PJ en vista Notas DM"
```
