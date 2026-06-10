# Eliminar nota con modal de confirmación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar botón de eliminar en cada NoteCard de la página Notas, con modal de confirmación, accesible para el DM (cualquier nota) y jugadores (sus propias notas).

**Architecture:** `deletePlayerNote(note_id)` se agrega al contexto en `App.jsx` para el delete real en Firestore (sin `window.confirm()` bakeado). `Notas.jsx` maneja todo el estado del modal y el botón de trash inline. Dos tasks independientes: contexto primero, UI después.

**Tech Stack:** React 18, Firestore (firebase/firestore), Lucide icons (`Trash2`), Tailwind CSS con custom properties del proyecto.

> **Nota:** No hay test runner configurado. El testing es manual con `npm run dev`.

---

### Task 1: Agregar `deletePlayerNote` al contexto en App.jsx

**Files:**
- Modify: `src/App.jsx`

El archivo está en `e:\Claude Cowork\Drakterima\dragones-wiki\src\App.jsx`. La función `savePlayerNote` está alrededor de la línea 165. La función `remove` existente (línea 327) tiene `window.confirm()` bakeado y llama `setForm(null)` — no sirve para notes. Se necesita una función dedicada.

- [ ] **Step 1: Agregar `deletePlayerNote` después de `savePlayerNote`**

Localizar el bloque de `savePlayerNote` (líneas 165–169). Insertar la nueva función inmediatamente después:

```js
  async function deletePlayerNote(note_id) {
    await deleteDoc(doc(firestore, 'player_notes', note_id))
    showToast('Nota eliminada')
  }
```

El import de `deleteDoc` ya existe en la línea 7 (`import { ..., deleteDoc, ... } from 'firebase/firestore'`). No se necesita agregar nada al bloque de imports.

- [ ] **Step 2: Exponer `deletePlayerNote` en el ctx**

Localizar el objeto `ctx` (alrededor de la línea 350). Agregar `deletePlayerNote` justo después de `savePlayerNote`:

```js
    savePlayerNote,
    deletePlayerNote,
```

El bloque `ctx` queda así en esa sección:

```js
    savePlayerNote,
    deletePlayerNote,
    saveGameResult,
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: agregar deletePlayerNote al contexto"
```

---

### Task 2: Botón de eliminar y ConfirmModal en Notas.jsx

**Files:**
- Modify: `src/pages/Notas.jsx`

El archivo está en `e:\Claude Cowork\Drakterima\dragones-wiki\src\pages\Notas.jsx`. Leer el archivo completo antes de editar.

#### Cambios requeridos (en orden):

- [ ] **Step 1: Actualizar imports**

Reemplazar las 3 líneas de imports actuales (líneas 1–3):

```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { NotebookPen } from 'lucide-react'
```

Con:

```jsx
import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { NotebookPen, Trash2 } from 'lucide-react'
import { btnDanger, btnSecondary } from '../constants'
```

- [ ] **Step 2: Reemplazar el componente `NoteCard`**

Reemplazar el componente `NoteCard` completo (función entera, desde `function NoteCard` hasta su `}` de cierre):

```jsx
function NoteCard({ note, db, goToDetail, onDelete }) {
  const name = entityName(db, note.type, note.entity_id)
  const label = TYPE_LABELS[note.type] || note.type
  return (
    <div
      className="bg-bg-card border border-border-base px-5 py-4 cursor-pointer transition-colors hover:border-accent-dim hover:bg-bg-card-hover"
      onClick={() => goToDetail(note.type, note.entity_id)}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
          {name}
        </span>
        <span className="font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted bg-border-light px-1.5 py-0.5 rounded-sm">
          {label}
        </span>
        {onDelete && (
          <button
            className="ml-auto p-0.5 text-txt-muted hover:text-red-400 transition-colors cursor-pointer"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="text-[13px] text-txt-secondary leading-[1.65] line-clamp-3">
        {note.text}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Agregar `ConfirmModal` después de `PageHeader`**

Insertar el nuevo componente `ConfirmModal` inmediatamente después del cierre `}` de `PageHeader`:

```jsx
function ConfirmModal({ note, db, onConfirm, onCancel }) {
  const name = entityName(db, note.type, note.entity_id)
  const label = TYPE_LABELS[note.type] || note.type

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-bg-card border border-border-base p-6 w-[min(380px,90vw)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-exo text-[15px] font-bold text-txt-primary mb-1">
          ¿Eliminar esta nota?
        </div>
        <div className="text-[13px] text-txt-muted mb-5">
          {name}
          <span className="font-exo text-[10px] tracking-[0.15em] uppercase ml-2">{label}</span>
        </div>
        <div className="flex gap-2.5 justify-end">
          <button className={btnDanger} onClick={onConfirm}>Eliminar</button>
          <button className={btnSecondary} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Actualizar el hook `useApp` y agregar estado `pendingDelete`**

Reemplazar la línea actual:

```jsx
  const { db, isDM, currentPlayer, goToDetail } = useApp()
  const [selectedPjId, setSelectedPjId] = useState(null)
```

Con:

```jsx
  const { db, isDM, currentPlayer, goToDetail, deletePlayerNote } = useApp()
  const [selectedPjId, setSelectedPjId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
```

- [ ] **Step 5: Pasar `onDelete` a NoteCard en la vista DM**

En el map de la vista DM, localizar:

```jsx
                  {notes.map(note => (
                    <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} />
                  ))}
```

Reemplazar con:

```jsx
                  {notes.map(note => (
                    <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
                  ))}
```

- [ ] **Step 6: Agregar `ConfirmModal` al final del return DM**

En el return de la vista DM, localizar el `</div>` de cierre del `<div>` raíz (el que contiene `<PageHeader />`). Agregar el modal justo antes de ese cierre:

```jsx
        {pendingDelete && (
          <ConfirmModal
            note={pendingDelete}
            db={db}
            onConfirm={() => { deletePlayerNote(pendingDelete.id); setPendingDelete(null) }}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    )
  }
```

El return completo de la vista DM debe quedar así al final:

```jsx
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
              {/* ... botones de filtro ... */}
            </div>
            {displayed.map(({ pj, notes }) => (
              <div key={pj.id} className="mb-8">
                {/* ... encabezado del grupo ... */}
                <div className="flex flex-col gap-2.5">
                  {notes.map(note => (
                    <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {pendingDelete && (
          <ConfirmModal
            note={pendingDelete}
            db={db}
            onConfirm={() => { deletePlayerNote(pendingDelete.id); setPendingDelete(null) }}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    )
  }
```

- [ ] **Step 7: Pasar `onDelete` a NoteCard en la vista jugador**

Localizar el map de la vista jugador (al final del archivo):

```jsx
        {myNotes.map(note => (
          <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} />
        ))}
```

Reemplazar con:

```jsx
        {myNotes.map(note => (
          <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
        ))}
```

- [ ] **Step 8: Agregar `ConfirmModal` al return de la vista jugador**

El return de la vista jugador actualmente termina así:

```jsx
    return (
      <div>
        <PageHeader />
        {myNotes.length === 0 ? (
          <div className="text-txt-muted text-[13px] italic mt-8">
            Todavía no tenés notas guardadas.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {myNotes.map(note => (
              <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
            ))}
          </div>
        )}
      </div>
    )
```

Reemplazar ese bloque completo con:

```jsx
    return (
      <div>
        <PageHeader />
        {myNotes.length === 0 ? (
          <div className="text-txt-muted text-[13px] italic mt-8">
            Todavía no tenés notas guardadas.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {myNotes.map(note => (
              <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
            ))}
          </div>
        )}
        {pendingDelete && (
          <ConfirmModal
            note={pendingDelete}
            db={db}
            onConfirm={() => { deletePlayerNote(pendingDelete.id); setPendingDelete(null) }}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    )
```

- [ ] **Step 9: Verificar en el dev server**

```bash
npm run dev
```

Pasos manuales:
1. Iniciar sesión como DM. Navegar a "Notas".
2. Verificar que cada NoteCard muestra un ícono de papelera (Trash2) a la derecha del header.
3. Hacer click en el ícono — verificar que el card NO navega (stopPropagation funciona).
4. Verificar que aparece el modal con nombre de entidad + tipo y botones "Eliminar" / "Cancelar".
5. Presionar Escape — verificar que el modal se cierra sin borrar.
6. Hacer click en "Cancelar" — verificar que el modal se cierra sin borrar.
7. Hacer click en "Eliminar" — verificar que el modal se cierra, aparece toast "Nota eliminada" y la nota desaparece.
8. Hacer click en el overlay del modal (fuera del card) — verificar que cierra sin borrar.
9. Iniciar sesión como jugador. Navegar a "Notas". Verificar las mismas interacciones.

- [ ] **Step 10: Commit**

```bash
git add src/pages/Notas.jsx
git commit -m "feat: botón eliminar nota con modal de confirmación"
```
