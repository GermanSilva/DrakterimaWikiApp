# Buscador de notas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un buscador a `Notas.jsx` que filtre por título de artículo, sección y contenido, con sintaxis `[sección]` y chips clicables como atajos.

**Architecture:** Todo el cambio ocurre en `src/pages/Notas.jsx`. Se agregan funciones puras (`normalize`, `parseQuery`, `filterNotes`), un mapa `CHIP_VALUE`, y un componente interno `SearchBar`. El estado `query` vive en `Notas()` y se aplica sobre las notas antes de renderizar, en ambas vistas (DM y jugador).

**Tech Stack:** React 18, lucide-react (icono `Search`), Tailwind CSS vía clases existentes del proyecto.

---

### Task 1: Agregar utilidades (`normalize`, `parseQuery`, `filterNotes`, `CHIP_VALUE`) e import de `Search`

**Files:**
- Modify: `src/pages/Notas.jsx`

- [ ] **Step 1: Agregar `Search` al import de lucide-react**

En `src/pages/Notas.jsx`, reemplazar la línea 3:

```js
// antes
import { NotebookPen, Trash2 } from 'lucide-react'
// después
import { NotebookPen, Trash2, Search } from 'lucide-react'
```

- [ ] **Step 2: Agregar `CHIP_VALUE`, `normalize`, `parseQuery`, `filterNotes` después de `TYPE_LABELS`**

Insertar el siguiente bloque después del cierre de `TYPE_LABELS` (después de la línea 14, antes de `function entityName`):

```js
const CHIP_VALUE = {
  sesiones:  'sesion',
  pjs:       'pj',
  pnjs:      'pnj',
  lugares:   'lugar',
  facciones: 'faccion',
  lore:      'lore',
  items:     'item',
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function parseQuery(q) {
  const match = q.match(/\[([^\]]+)\]/)
  const sectionFilter = match ? match[1].trim() : null
  const textFilter = q.replace(/\[[^\]]*\]/, '').trim()
  return { sectionFilter, textFilter }
}

function filterNotes(notes, parsed, db) {
  const { sectionFilter, textFilter } = parsed
  return notes.filter(note => {
    if (sectionFilter) {
      const sf = normalize(sectionFilter)
      const label = normalize(TYPE_LABELS[note.type] || note.type)
      const key = normalize(note.type)
      if (!label.includes(sf) && !key.includes(sf)) return false
    }
    if (textFilter) {
      const tf = normalize(textFilter)
      const title = normalize(entityName(db, note.type, note.entity_id))
      const text = normalize(note.text)
      const label = sectionFilter ? '' : normalize(TYPE_LABELS[note.type] || note.type)
      if (!title.includes(tf) && !text.includes(tf) && !label.includes(tf)) return false
    }
    return true
  })
}
```

- [ ] **Step 3: Verificar que el archivo compila**

```bash
npm run build
```

Esperado: build sin errores. Si falla, revisar que `entityName` esté definida *antes* de `filterNotes` en el archivo (actualmente está en línea 16 — verificar que el bloque nuevo se insertó después de línea 14 y antes de línea 16).

---

### Task 2: Agregar el componente `SearchBar`

**Files:**
- Modify: `src/pages/Notas.jsx`

- [ ] **Step 1: Insertar `SearchBar` justo antes de `export default function Notas()`**

Insertar el siguiente bloque entre el cierre de `ConfirmModal` y la línea `export default function Notas()`:

```jsx
function SearchBar({ query, onChange, sectionTypes }) {
  const { sectionFilter } = parseQuery(query)
  const activeSection = sectionFilter ? normalize(sectionFilter) : null

  function toggleChip(type) {
    const val = CHIP_VALUE[type]
    if (activeSection != null && normalize(val) === activeSection) {
      onChange(query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim())
    } else {
      const withoutBracket = query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim()
      onChange(`[${val}]${withoutBracket ? ' ' + withoutBracket : ''}`)
    }
  }

  return (
    <div className="mb-6">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none" />
        <input
          type="text"
          className="w-full bg-bg-mid border border-border-base text-txt-primary text-[13px] font-[inherit] pl-8 pr-3 py-2 outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar… o [sección] texto"
          value={query}
          onChange={e => onChange(e.target.value)}
        />
      </div>
      {sectionTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {sectionTypes.map(type => {
            const val = CHIP_VALUE[type]
            const isActive = activeSection != null && normalize(val) === activeSection
            return (
              <button
                key={type}
                className={`font-exo text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border transition-colors cursor-pointer ${
                  isActive
                    ? 'border-accent bg-accent/10 text-txt-primary'
                    : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                }`}
                onClick={() => toggleChip(type)}
              >
                {TYPE_LABELS[type]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar que el archivo compila**

```bash
npm run build
```

Esperado: build sin errores.

---

### Task 3: Cablear la vista del jugador

**Files:**
- Modify: `src/pages/Notas.jsx`

- [ ] **Step 1: Agregar estado `query` en `Notas()`**

En `src/pages/Notas.jsx`, dentro de `export default function Notas()`, reemplazar:

```js
// antes (líneas 103-105)
  const { db, isDM, currentPlayer, goToDetail, deletePlayerNote } = useApp()
  const [selectedPjId, setSelectedPjId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
```

```js
// después
  const { db, isDM, currentPlayer, goToDetail, deletePlayerNote } = useApp()
  const [selectedPjId, setSelectedPjId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [query, setQuery] = useState('')
```

- [ ] **Step 2: Reemplazar la vista del jugador (bloque al final del componente)**

Reemplazar desde `const myNotes = activeNotes.filter(...)` hasta el final del `return` del jugador (todo lo que viene después del `if (isDM) { ... }`):

```js
// antes
  const myNotes = activeNotes.filter(n => n.pj_id === currentPlayer.id)

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

```jsx
// después
  const rawNotes = activeNotes.filter(n => n.pj_id === currentPlayer.id)
  const playerSectionTypes = [...new Set(rawNotes.map(n => n.type))]
  const myNotes = filterNotes(rawNotes, parseQuery(query), db)

  return (
    <div>
      <PageHeader />
      {rawNotes.length === 0 ? (
        <div className="text-txt-muted text-[13px] italic mt-8">
          Todavía no tenés notas guardadas.
        </div>
      ) : (
        <>
          <SearchBar query={query} onChange={setQuery} sectionTypes={playerSectionTypes} />
          {myNotes.length === 0 ? (
            <div className="text-txt-muted text-[13px] italic mt-4">
              No hay notas que coincidan con «{query}».
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {myNotes.map(note => (
                <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
              ))}
            </div>
          )}
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
```

- [ ] **Step 3: Verificar build**

```bash
npm run build
```

Esperado: build sin errores.

---

### Task 4: Cablear la vista del DM

**Files:**
- Modify: `src/pages/Notas.jsx`

- [ ] **Step 1: Reemplazar el bloque `if (isDM) { ... }` completo**

Reemplazar todo el bloque `if (isDM) { ... return (...) }` (actualmente líneas 120–190) con:

```jsx
  if (isDM) {
    const allGrouped = (db.pjs || [])
      .map(pj => ({ pj, notes: activeNotes.filter(n => n.pj_id === pj.id) }))
      .filter(g => g.notes.length > 0)

    const activePjIds = new Set(allGrouped.map(g => g.pj.id))
    const effectiveFilter = activePjIds.has(selectedPjId) ? selectedPjId : null

    const pjFilteredNotes = effectiveFilter != null
      ? activeNotes.filter(n => n.pj_id === effectiveFilter)
      : activeNotes

    const dmSectionTypes = [...new Set(pjFilteredNotes.map(n => n.type))]

    const parsed = parseQuery(query)
    const displayed = (db.pjs || [])
      .map(pj => ({ pj, notes: filterNotes(pjFilteredNotes.filter(n => n.pj_id === pj.id), parsed, db) }))
      .filter(g => g.notes.length > 0)

    return (
      <div>
        <PageHeader />
        {allGrouped.length === 0 ? (
          <div className="text-txt-muted text-[13px] italic mt-8">
            No hay notas de jugadores todavía.
          </div>
        ) : (
          <>
            <SearchBar query={query} onChange={setQuery} sectionTypes={dmSectionTypes} />
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                  effectiveFilter === null
                    ? 'border-accent bg-accent/10 text-txt-primary'
                    : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                }`}
                onClick={() => setSelectedPjId(null)}
              >
                Todas
              </button>
              {allGrouped.map(({ pj }) => (
                <button
                  key={pj.id}
                  className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                    effectiveFilter === pj.id
                      ? 'border-accent bg-accent/10 text-txt-primary'
                      : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                  }`}
                  onClick={() => setSelectedPjId(pj.id)}
                >
                  {pj.nombre}
                </button>
              ))}
            </div>
            {displayed.length === 0 ? (
              <div className="text-txt-muted text-[13px] italic mt-4">
                No hay notas que coincidan con «{query}».
              </div>
            ) : (
              displayed.map(({ pj, notes }) => (
                <div key={pj.id} className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <NotebookPen size={13} className="text-txt-muted" />
                    <span className="font-exo text-[11px] font-semibold tracking-[0.2em] text-txt-muted uppercase">
                      {pj.nombre}{pj.jugador ? ` · ${pj.jugador}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {notes.map(note => (
                      <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} onDelete={() => setPendingDelete(note)} />
                    ))}
                  </div>
                </div>
              ))
            )}
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

- [ ] **Step 2: Verificar build final**

```bash
npm run build
```

Esperado: build sin errores, sin warnings sobre variables no usadas.

---

### Task 5: Verificar en el browser y hacer commit

**Files:**
- No changes

- [ ] **Step 1: Levantar el servidor de desarrollo**

```bash
npm run dev
```

Abrir `http://localhost:5173` en el browser.

- [ ] **Step 2: Verificar vista de jugador**

1. Acceder como jugador.
2. Ir a "Notas" — debe aparecer el input de búsqueda y chips con las secciones presentes.
3. Escribir texto que aparezca en el contenido de una nota → debe filtrar correctamente.
4. Escribir `[lugar]` → debe mostrar solo notas de Lugares.
5. Escribir `[lugar] kardevir` → debe mostrar notas de Lugares que tengan "kardevir" en título o texto.
6. Hacer click en un chip → debe insertar el `[xxx]` en el input.
7. Hacer click en el chip activo → debe quitarlo.
8. Buscar algo que no exista → debe mostrar "No hay notas que coincidan con «…»."
9. Vaciar el input → vuelven a aparecer todas las notas.

- [ ] **Step 3: Verificar vista DM**

1. Acceder como DM.
2. Ir a "Notas" → debe aparecer el buscador encima de los filtros por PJ.
3. Seleccionar un PJ con el filtro → los chips deben reflejar solo las secciones de ese PJ.
4. Buscar texto → filtra dentro del PJ seleccionado.
5. Cambiar a "Todas" → chips vuelven a mostrar todas las secciones.
6. Búsqueda sin resultados → "No hay notas que coincidan con «…»."

- [ ] **Step 4: Commit**

```bash
git add src/pages/Notas.jsx
git commit -m "feat: buscador de notas con sintaxis [sección] y chips"
```
