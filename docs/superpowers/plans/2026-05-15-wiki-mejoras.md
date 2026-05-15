# Wiki Mejoras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all pending bugs and UI/functional improvements from WIKI_MEJORAS.md into the React + Vite dragones-wiki app.

**Architecture:** Pure client-side React 18 SPA. State lives in `App.jsx` and is distributed via `AppContext`. Mutations go through `save()` / `remove()`. No test runner — verification is manual via `npm run dev`.

**Tech Stack:** React 18, Vite 5, plain CSS custom properties, localStorage persistence.

---

## Files touched across all tasks

| File | Tasks |
|---|---|
| `src/App.jsx` | Task 1 (Escape key) |
| `src/pages/PJs.jsx` | Task 2 (jugador placeholder), Task 4 (search), Task 6 (lock icon) |
| `src/pages/Sesiones.jsx` | Task 3 (planned badge) |
| `src/styles.css` | Task 3 (planned CSS), Task 7 (card animation), Task 8 (scene-item), Task 9 (mobile sidebar) |
| `src/pages/Dashboard.jsx` | Task 5 (dashboard blocks) |
| `src/pages/PNJs.jsx` | Task 4 (search), Task 6 (lock icon) |
| `src/components/FormModal.jsx` | Task 10 (form close confirmation) |
| `src/components/DetailPanel.jsx` | Task 8 (scene rendering), Task 11 (region accent) |
| `src/components/Header.jsx` | Task 9 (hamburger button) |

---

## Task 1: BUG 3 — Escape key closes overlays

**Files:**
- Modify: `src/App.jsx`

No test runner — verify manually after implementation.

- [ ] **Step 1: Add useEffect import (already imported — verify)**

Open `src/App.jsx`. Line 1 already imports `useState`. Confirm `useEffect` is NOT yet imported:
```jsx
import { useState } from 'react'
```
Change to:
```jsx
import { useState, useEffect } from 'react'
```

- [ ] **Step 2: Add the keydown listener**

In `App.jsx`, inside the `App` component body, after the state declarations (around line 57, after `const [toastMsg, setToastMsg] = useState('')`), add:

```jsx
useEffect(() => {
  function onKey(e) {
    if (e.key !== 'Escape') return
    if (form) { setForm(null); return }
    if (detail) { setDetail(null) }
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [form, detail])
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`. Open the app. Open a detail panel (click any card), press Escape — panel should close. Open a form modal (click "+ Nuevo"), press Escape — modal should close.

- [ ] **Step 4: Commit**

```
git add src/App.jsx
git commit -m "fix: close overlays on Escape key"
```

---

## Task 2: MEJORA 4 — "Sin asignar" placeholder in PJ cards

**Files:**
- Modify: `src/pages/PJs.jsx`

- [ ] **Step 1: Update the card footer in PJs.jsx**

In `src/pages/PJs.jsx`, find line 30:
```jsx
<span className="card-meta">Nv. {p.nivel || 1} · {p.jugador || '?'}</span>
```
Replace with:
```jsx
<span className="card-meta">
  Nv. {p.nivel || 1} ·{' '}
  {p.jugador || <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>}
</span>
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev`. Go to PJs page. Cards for characters without a `jugador` value should now show "Sin asignar" in a dimmer color instead of "?".

- [ ] **Step 3: Commit**

```
git add src/pages/PJs.jsx
git commit -m "fix: show 'Sin asignar' instead of '?' for unassigned players"
```

---

## Task 3: MEJORA 3 — Planned vs. played session badge

**Files:**
- Modify: `src/pages/Sesiones.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add `planned` class to timeline items**

In `src/pages/Sesiones.jsx`, find the `.timeline-item` div (line 18):
```jsx
<div key={s.id} className="timeline-item" onClick={() => openDetail('sesiones', s.id)}>
```
Replace with:
```jsx
<div
  key={s.id}
  className={`timeline-item${!s.logros?.trim() ? ' planned' : ''}`}
  onClick={() => openDetail('sesiones', s.id)}
>
```

- [ ] **Step 2: Add CSS for the planned state**

In `src/styles.css`, find the `.timeline-dot` rule and add after it:
```css
.timeline-item.planned .timeline-dot {
  background: transparent;
  border-color: var(--text-muted);
}
.timeline-item.planned .timeline-title { color: var(--text-secondary); }
```

- [ ] **Step 3: Verify in browser**

Go to Sesiones. Session 1 ("El Escuadrón Incompleto") has `logros: ''` in the seed — its dot should appear hollow/grey. If you create a session and fill in logros, its dot should appear solid.

- [ ] **Step 4: Commit**

```
git add src/pages/Sesiones.jsx src/styles.css
git commit -m "feat: distinguish planned vs played sessions in timeline"
```

---

## Task 4: MEJORA 1 — Live search in PJs and PNJs

**Files:**
- Modify: `src/pages/PJs.jsx`
- Modify: `src/pages/PNJs.jsx`
- Modify: `src/styles.css` (add `.search-bar` styles if not present)

- [ ] **Step 1: Add search to PJs.jsx**

Replace the entire contents of `src/pages/PJs.jsx` with:
```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, PageHeader, EmptyState } from '../components/Shared'

export default function PJs() {
  const { db, openDetail, openForm } = useApp()
  const [query, setQuery] = useState('')

  const lista = query.trim()
    ? db.pjs.filter(p =>
        [p.nombre, p.clase, p.raza, p.jugador].some(v =>
          (v || '').toLowerCase().includes(query.toLowerCase())
        )
      )
    : db.pjs

  return (
    <div>
      <PageHeader eyebrow="Personajes Jugadores" title="El Grupo">
        <button className="btn btn-primary" onClick={() => openForm('pjs')}>+ Nuevo PJ</button>
      </PageHeader>

      <div className="search-bar">
        <input
          placeholder="Buscar por nombre, clase, raza o jugador…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState icon="🛡️" title="Sin resultados" text={query ? 'No hay PJs que coincidan con la búsqueda.' : 'Agregá los personajes jugadores creados en la sesión cero.'} />
      ) : (
        <div className="cards-grid">
          {lista.map(p => (
            <div key={p.id} className="card" onClick={() => openDetail('pjs', p.id)}>
              <div className="card-header">
                <div className="card-title">{p.nombre}</div>
                <span className="card-icon">🛡️</span>
              </div>
              <div className="card-tags">
                <Tag cls="pj" text={p.clase || 'Clase'} />
                {p.raza && <Tag cls="neutral" text={p.raza} />}
                {p.region && <RegionTag region={p.region} />}
              </div>
              <div className="card-desc">{p.trasfondo || 'Sin trasfondo registrado.'}</div>
              <div className="card-footer">
                <span className="card-meta">
                  Nv. {p.nivel || 1} ·{' '}
                  {p.jugador || <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add search to PNJs.jsx**

In `src/pages/PNJs.jsx`, add `query` state and combine it with the existing `filtro` filter. Replace the file contents with:
```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, RelacionTag, PageHeader, EmptyState, FilterPills } from '../components/Shared'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'aliado', label: 'Aliados' },
  { value: 'neutral', label: 'Neutrales' },
  { value: 'enemigo', label: 'Enemigos' },
]

export default function PNJs() {
  const { db, openDetail, openForm } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [query, setQuery] = useState('')

  const lista = db.pnjs
    .filter(p => filtro === 'todos' || p.relacion === filtro)
    .filter(p => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return [p.nombre, p.rol, p.faccion].some(v => (v || '').toLowerCase().includes(q))
    })

  return (
    <div>
      <PageHeader eyebrow="Personajes No Jugadores" title="PNJs">
        <button className="btn btn-primary" onClick={() => openForm('pnjs')}>+ Nuevo PNJ</button>
      </PageHeader>

      <FilterPills options={FILTROS} value={filtro} onChange={setFiltro} />

      <div className="search-bar">
        <input
          placeholder="Buscar por nombre, rol o facción…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState icon="🎭" title="Sin resultados" text={query ? 'No hay PNJs que coincidan con la búsqueda.' : 'Agregá personajes no jugadores para poblar Drakterima.'} />
      ) : (
        <div className="cards-grid">
          {lista.map(p => (
            <div key={p.id} className="card" onClick={() => openDetail('pnjs', p.id)}>
              <div className="card-header">
                <div className="card-title">{p.nombre}</div>
                <span className="card-icon">🎭</span>
              </div>
              <div className="card-tags">
                {p.rol && <Tag cls="neutral" text={p.rol} />}
                {p.region && <RegionTag region={p.region} />}
                {p.relacion && <RelacionTag relacion={p.relacion} />}
                {p.faccion && <Tag cls="orden" text={p.faccion} />}
              </div>
              <div className="card-desc">{p.descripcion || 'Sin descripción.'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add .search-bar CSS**

In `src/styles.css`, find the `.filter-pills` rule and add after the filter-pills block:
```css
.search-bar {
  margin-bottom: 20px;
}
.search-bar input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  color: var(--text-primary);
  padding: 9px 14px;
  font-family: 'Barlow', sans-serif;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.search-bar input:focus { border-color: var(--accent-dim); }
.search-bar input::placeholder { color: var(--text-muted); }
```

- [ ] **Step 4: Verify in browser**

Go to PJs page, type "Pal" — only Eldric (Paladín) should appear. Clear search, all 6 PJs appear. Go to PNJs page, type "Gremio" — Maelis appears. Set filter to "Enemigos" — empty state appears.

- [ ] **Step 5: Commit**

```
git add src/pages/PJs.jsx src/pages/PNJs.jsx src/styles.css
git commit -m "feat: add live text search to PJs and PNJs pages"
```

---

## Task 5: MEJORA 2 — Richer Dashboard

**Files:**
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add "Próxima sesión" and "PNJs recientes" blocks to Dashboard.jsx**

Replace the contents of `src/pages/Dashboard.jsx` with:
```jsx
import { useApp } from '../AppContext'
import { RelacionTag } from '../components/Shared'

export default function Dashboard() {
  const { db, navigate, openDetail } = useApp()
  const lastSesion = db.sesiones.length ? db.sesiones[db.sesiones.length - 1] : null
  const nextSesion = db.sesiones.find(s => !s.logros?.trim()) ?? null
  const recentPNJs = db.pnjs.slice(-3).reverse()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Vista General</div>
          <div className="page-title">Panel de Campaña</div>
          <div className="page-subtitle">Leyendas de Drakterima · D&D 5E Homebrew</div>
        </div>
      </div>

      <div className="info-box">
        <div className="info-box-title">🐉 Conflicto Central</div>
        <div className="info-box-text">
          Dos dragones milenarios —Argan y Ragon— libran una guerra de influencia sobre Drakterima. La Orden de Argan (diplomacia, estructura) y el Culto de Ragon (conquista, poder) son sus brazos. Los aventureros del Gremio, con sede en Kardevir, podrían cambiar el equilibrio del continente.
        </div>
      </div>

      <div className="dashboard-grid">
        {[
          { key: 'sesiones', icon: '📜', label: 'Sesiones' },
          { key: 'pjs', icon: '🛡️', label: 'Jugadores' },
          { key: 'pnjs', icon: '🎭', label: 'PNJs' },
          { key: 'lugares', icon: '🗺️', label: 'Lugares' },
          { key: 'facciones', icon: '⚜️', label: 'Facciones' },
          { key: 'lore', icon: '📖', label: 'Lore' },
        ].map(({ key, icon, label }) => (
          <div key={key} className="stat-card" onClick={() => navigate(key)}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-number">{(db[key] || []).length}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {nextSesion && (
        <>
          <div className="divider">Próxima Sesión</div>
          <div
            className="lore-block"
            style={{ borderLeftColor: 'var(--accent)', cursor: 'pointer' }}
            onClick={() => openDetail('sesiones', nextSesion.id)}
          >
            <div className="lore-block-title">
              📋 Sesión {nextSesion.numero} — {nextSesion.titulo || 'Sin título'}
            </div>
            {nextSesion.ganchos && (
              <div className="lore-block-text" style={{ marginTop: 6 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Exo 2', sans-serif" }}>Ganchos</span>
                <br />
                {nextSesion.ganchos.substring(0, 280)}{nextSesion.ganchos.length > 280 ? '…' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {recentPNJs.length > 0 && (
        <>
          <div className="divider">PNJs Recientes</div>
          <div className="dashboard-pnj-row">
            {recentPNJs.map(p => (
              <div
                key={p.id}
                className="dashboard-pnj-card"
                onClick={() => openDetail('pnjs', p.id)}
              >
                <div className="dashboard-pnj-name">{p.nombre}</div>
                {p.rol && <div className="dashboard-pnj-rol">{p.rol}</div>}
                {p.relacion && (
                  <div style={{ marginTop: 6 }}>
                    <RelacionTag relacion={p.relacion} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="divider">Lore del Mundo</div>

      <div className="lore-block">
        <div className="lore-block-title">🏔️ Regiones de Drakterima</div>
        <div className="lore-block-text">
          <strong style={{ color: 'var(--text-primary)' }}>Magral</strong> · Corazón fértil del sur. Capital: Genesia. Gobernada por la Orden de Argan.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Nezor</strong> · Desierto del este. Organizado en clanes y confederaciones de caudillos del Culto de Ragon.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Tierras Heladas</strong> · Norte implacable. Dominado por los Goliath. Independientes de Magral.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Islas Pétreas</strong> · Archipiélago suroeste. Neutral. Industria minera, metalúrgica y naval.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Kardevir</strong> · Ciudad del Paso. Centro geográfico. Sede del Gremio de Aventureros.
        </div>
      </div>

      <div className="lore-block" style={{ borderLeftColor: 'var(--accent)' }}>
        <div className="lore-block-title">💎 La Magralita — Sangre del Mundo</div>
        <div className="lore-block-text">
          Mineral mágico de alto valor estratégico. Potencia objetos arcanos y estabiliza conjuros complejos. Su manipulación indebida genera inestabilidad peligrosa. Controlar sus yacimientos implica poder económico, militar y político.
        </div>
      </div>

      {lastSesion && (
        <>
          <div className="divider">Última Sesión</div>
          <div className="lore-block" style={{ borderLeftColor: 'var(--accent-dim)', cursor: 'pointer' }} onClick={() => navigate('sesiones')}>
            <div className="lore-block-title">📜 {lastSesion.titulo || `Sesión ${lastSesion.numero}`}</div>
            <div className="lore-block-text">{(lastSesion.resumen || 'Sin resumen.').substring(0, 220)}{lastSesion.resumen?.length > 220 ? '...' : ''}</div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add dashboard-pnj-row and dashboard-pnj-card CSS**

In `src/styles.css`, after the `.dashboard-grid` rule block, add:
```css
.dashboard-pnj-row {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.dashboard-pnj-card {
  flex: 1;
  min-width: 160px;
  max-width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.dashboard-pnj-card:hover {
  border-color: var(--accent-dim);
  background: var(--bg-card-hover);
}
.dashboard-pnj-name {
  font-family: 'Exo 2', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.dashboard-pnj-rol {
  font-size: 12px;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Verify in browser**

Go to Dashboard. With seed data:
- "Próxima sesión" block should appear (Sesión 1 has empty logros) showing title and ganchos.
- "PNJs recientes" block should show Maelis and Varnek as mini-cards.
- Clicking a PNJ card should open its detail panel.
- Clicking the "Próxima sesión" block should open Sesión 1's detail panel.

- [ ] **Step 4: Commit**

```
git add src/pages/Dashboard.jsx src/styles.css
git commit -m "feat: add next session and recent NPCs blocks to dashboard"
```

---

## Task 6: UI 3 — Lock icon on DM-secret cards

**Files:**
- Modify: `src/pages/PJs.jsx`
- Modify: `src/pages/PNJs.jsx`

- [ ] **Step 1: Add lock icon to PJ cards**

In `src/pages/PJs.jsx`, in the `card-header` div, add the lock icon after the `card-icon` span:
```jsx
<div className="card-header">
  <div className="card-title">{p.nombre}</div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    {p.notas && <span style={{ fontSize: 10, opacity: 0.45 }} title="Tiene notas DM">🔒</span>}
    <span className="card-icon">🛡️</span>
  </div>
</div>
```

- [ ] **Step 2: Add lock icon to PNJ cards**

In `src/pages/PNJs.jsx`, same pattern:
```jsx
<div className="card-header">
  <div className="card-title">{p.nombre}</div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    {p.secreto && <span style={{ fontSize: 10, opacity: 0.45 }} title="Tiene secreto DM">🔒</span>}
    <span className="card-icon">🎭</span>
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

On PJs page: all 6 seed PJs have `notas` — all should show 🔒. On PNJs: both Maelis and Varnek have `secreto` — both should show 🔒. Creating a new PNJ without `secreto` should show no lock.

- [ ] **Step 4: Commit**

```
git add src/pages/PJs.jsx src/pages/PNJs.jsx
git commit -m "feat: show DM lock indicator on cards with secret notes"
```

---

## Task 7: UI 2 — Card entry animation

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add keyframe and card animation CSS**

In `src/styles.css`, find the `.card {` rule and add the animation property to it. Also add the keyframe above it. Find the block where `.card` is defined and add:

```css
@keyframes cardIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Then in the `.card` rule, add:
```css
animation: cardIn 0.2s ease both;
```

After the `.card` rule, add the stagger delays:
```css
.cards-grid .card:nth-child(1) { animation-delay: 0.02s; }
.cards-grid .card:nth-child(2) { animation-delay: 0.04s; }
.cards-grid .card:nth-child(3) { animation-delay: 0.06s; }
.cards-grid .card:nth-child(4) { animation-delay: 0.08s; }
.cards-grid .card:nth-child(5) { animation-delay: 0.10s; }
.cards-grid .card:nth-child(6) { animation-delay: 0.12s; }
```

- [ ] **Step 2: Verify in browser**

Navigate between pages (PJs, PNJs, Lugares). Cards should fade and slide in with a staggered delay of 20ms per card.

- [ ] **Step 3: Commit**

```
git add src/styles.css
git commit -m "feat: add staggered fade-in animation for cards"
```

---

## Task 8: UI 4 — Scene rendering in session detail panel

**Files:**
- Modify: `src/components/DetailPanel.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add renderResumen helper and use it in SesionDetail**

In `src/components/DetailPanel.jsx`, add this helper function before the `SesionDetail` component (after the imports, before line 8):
```jsx
function renderResumen(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    if (/^\d+\./.test(line.trim())) {
      return <div key={i} className="scene-item">{line}</div>
    }
    return <span key={i}>{line}<br /></span>
  })
}
```

Then in `SesionDetail`, replace the resumen section:
```jsx
// Replace:
<div className="detail-text" dangerouslySetInnerHTML={nl2br(item.resumen)} />
// With:
<div className="detail-text">{renderResumen(item.resumen)}</div>
```

Also remove the `nl2br` import from this usage (keep `nl2br` import if used elsewhere in the file — check logros and ganchos, which should keep using `dangerouslySetInnerHTML={nl2br(...)}` as-is).

- [ ] **Step 2: Add scene-item CSS**

In `src/styles.css`, after the `.detail-text` rule, add:
```css
.scene-item {
  padding: 6px 0 6px 14px;
  border-left: 2px solid var(--border);
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--text-secondary);
}
.scene-item:hover { border-left-color: var(--accent-dim); cursor: default; }
```

- [ ] **Step 3: Verify in browser**

Click on Sesión 1. In the resumen, lines starting with "1.", "2.", etc. (the escenas) should appear with a left border and slight indentation. Other lines render as normal text.

- [ ] **Step 4: Commit**

```
git add src/components/DetailPanel.jsx src/styles.css
git commit -m "feat: render numbered scene lines with visual accent in session detail"
```

---

## Task 9: UI 1 — Collapsible sidebar on mobile

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Header.jsx`
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add sidebarOpen state and toggle to App.jsx**

In `App.jsx`, add state after existing state declarations:
```jsx
const [sidebarOpen, setSidebarOpen] = useState(false)
```

Pass it to the context or as a prop. Since `Header` and the layout div both need it, the easiest approach is to pass `sidebarOpen` and `toggleSidebar` through context. Add to `ctx`:
```jsx
const ctx = {
  // ...existing fields...
  sidebarOpen,
  toggleSidebar: () => setSidebarOpen(v => !v),
}
```

In the JSX, add the class to `#layout`:
```jsx
<div id="layout" className={sidebarOpen ? 'sidebar-open' : ''}>
```

- [ ] **Step 2: Add hamburger button to Header.jsx**

Read `src/components/Header.jsx` first to see its current structure, then add the hamburger button in the `.header-right` area:
```jsx
import { useApp } from '../AppContext'

export default function Header() {
  const { toggleSidebar } = useApp()
  return (
    <header id="app-header">
      {/* existing header content */}
      <button className="hamburger-btn" onClick={toggleSidebar} aria-label="Menú">☰</button>
    </header>
  )
}
```
Place the button so it appears inside the header. Check the existing Header.jsx for its exact JSX and slot the button into `.header-right` or at the start of the header.

- [ ] **Step 3: Close sidebar on navigate (Sidebar.jsx)**

In `src/components/Sidebar.jsx`, read the file first. When a nav item is clicked, also call `toggleSidebar` if the sidebar is open on mobile. Add to the nav item click handler:
```jsx
const { navigate, sidebarOpen, toggleSidebar } = useApp()
// in the click handler:
() => { navigate(page); if (sidebarOpen) toggleSidebar() }
```

- [ ] **Step 4: Add mobile CSS**

In `src/styles.css`, after the `#sidebar` rule block, add:
```css
.hamburger-btn {
  display: none;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}
.hamburger-btn:hover { color: var(--text-primary); }

@media (max-width: 768px) {
  .hamburger-btn { display: block; }
  #sidebar {
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    z-index: 200;
  }
  #layout.sidebar-open #sidebar { transform: translateX(0); }
  #main { margin-left: 0; }
}
```

- [ ] **Step 5: Verify in browser**

Use browser devtools to simulate a mobile viewport (≤768px). The sidebar should be hidden. Clicking ☰ in the header should slide the sidebar in. Clicking a nav item should navigate and close the sidebar. On desktop (>768px), the hamburger should not appear.

- [ ] **Step 6: Commit**

```
git add src/App.jsx src/components/Header.jsx src/components/Sidebar.jsx src/styles.css
git commit -m "feat: collapsible sidebar with hamburger button on mobile"
```

---

## Task 10: MEJORA 5 — Confirm before closing form with data

**Files:**
- Modify: `src/components/FormModal.jsx`

- [ ] **Step 1: Replace the overlay onClick**

In `src/components/FormModal.jsx`, find the overlay div (near line 353):
```jsx
<div id="form-overlay" onClick={e => e.target.id === 'form-overlay' && closeForm()}>
```
Replace with:
```jsx
<div
  id="form-overlay"
  onClick={e => {
    if (e.target.id !== 'form-overlay') return
    const inputs = e.currentTarget.querySelectorAll('input, textarea, select')
    const hasData = [...inputs].some(el => el.value.trim())
    if (!hasData || confirm('¿Descartar cambios?')) closeForm()
  }}
>
```

- [ ] **Step 2: Verify in browser**

Open a "Nueva Sesión" form. Click outside without typing — form should close immediately. Type something, then click outside — a confirm dialog should appear. On "Aceptar" the form closes; on "Cancelar" it stays. For an edit form (which pre-fills values), the confirm should always appear since inputs already have content.

- [ ] **Step 3: Commit**

```
git add src/components/FormModal.jsx
git commit -m "feat: confirm before discarding unsaved form changes"
```

---

## Task 11: UI 5 — Region accent color in detail panel

**Files:**
- Modify: `src/components/DetailPanel.jsx`

- [ ] **Step 1: Add REGION_COLOR map and apply to detail views**

In `src/components/DetailPanel.jsx`, add this constant after the imports:
```jsx
const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}
```

Then in each detail view that has a `region` field — `PJDetail`, `PNJDetail`, `LugarDetail`, `FaccionDetail` — update the `detail-eyebrow` div to apply the color:
```jsx
// Example for PJDetail:
<div className="detail-eyebrow" style={{ color: REGION_COLOR[item.region] || undefined }}>
  Personaje Jugador · Nv. {item.nivel || 1}
</div>
```
Apply the same pattern to PNJDetail, LugarDetail, and FaccionDetail (each has its own eyebrow text but the style is the same `color: REGION_COLOR[item.region] || undefined`).

- [ ] **Step 2: Verify in browser**

Open a PJ from Magral — the eyebrow should have a green tint. Open a PNJ from Nezor — orange tint. Open a Lugar from Magral — green tint. Lore and Sesiones detail panels have no region so their eyebrow stays in the default color.

- [ ] **Step 3: Commit**

```
git add src/components/DetailPanel.jsx
git commit -m "feat: apply region accent color to detail panel eyebrow"
```

---

## Self-review

**Spec coverage:**
- BUG 1 ✅ — already resolved, documented in WIKI_MEJORAS.md, not in plan
- BUG 2 ✅ — already resolved, documented in WIKI_MEJORAS.md, not in plan
- BUG 3 ✅ — Task 1
- MEJORA 1 ✅ — Task 4
- MEJORA 2 ✅ — Task 5 (próxima sesión + PNJs recientes; conflicto y última sesión already exist)
- MEJORA 3 ✅ — Task 3
- MEJORA 4 ✅ — Task 2 (also incorporated into Task 4's PJs.jsx rewrite)
- MEJORA 5 ✅ — Task 10
- UI 1 ✅ — Task 9
- UI 2 ✅ — Task 7
- UI 3 ✅ — Task 6
- UI 4 ✅ — Task 8
- UI 5 ✅ — Task 11

**Note on MEJORA 4 + Task 4 overlap:** Task 2 implements the placeholder change in PJs.jsx. Task 4 rewrites PJs.jsx entirely, including the placeholder fix. If tasks are executed in order, Task 4 will supersede Task 2. If executing Task 4 first (or skipping Task 2), the placeholder is still included. No conflict.

**Placeholder scan:** No TBDs or TODOs found. All code steps show complete code.

**Type consistency:** `REGION_COLOR` map defined once in Task 11 and used only in DetailPanel.jsx. `renderResumen` defined in Task 8 and used only in SesionDetail. No cross-task type drift.
