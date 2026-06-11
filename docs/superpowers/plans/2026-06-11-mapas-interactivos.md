# Mapas Interactivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una sección de mapas interactivos con zoom/pan (Leaflet), pins clicables vinculados a artículos o sub-mapas, sistema de visibilidad por punto, y modo edición DM con click-to-place y pin fantasma draggable.

**Architecture:** `Mapas.jsx` maneja el estado de navegación (stack de breadcrumb). `MapViewer.jsx` contiene el MapContainer de react-leaflet con markers, popup y modo edición. `MapPopup.jsx` es un componente React posicionado absolutamente sobre el mapa (no el popup nativo de Leaflet). Los formularios `MapaForm.jsx` y `MapPointForm.jsx` se registran en el `FormModal` existente.

**Tech Stack:** `leaflet` + `react-leaflet` (CRS.Simple para imágenes no-geográficas). Firebase Firestore para colecciones `mapas` y `map_points`. React 18, Tailwind CSS, lucide-react.

---

## Contexto del codebase

Leer `CLAUDE.md` y `docs/superpowers/specs/2026-06-11-mapas-interactivos-design.md` para entender la arquitectura completa antes de implementar. Patrones clave:

- `save(type, data)` y `remove(type, id)` en `App.jsx` son las únicas mutaciones — jamás escribir a Firestore directamente desde componentes
- `useApp()` expone: `db`, `isDM`, `currentPlayer`, `save`, `remove`, `openForm`, `closeForm`, `goToDetail`
- `isVisible(entity, isDM, currentPlayer)` en `helpers.js` — usar en todos los filtros de listado
- `btnPrimary`, `btnSecondary`, `btnDanger`, `inputCls`, `labelCls` de `src/constants.js`
- `FormGroup`, `FormRow`, `EstadoField` de `src/components/FormModal.jsx` — importar para formularios
- `nextId(arr)` de `helpers.js` — para IDs nuevos

---

## Archivos

**Crear:**
- `src/pages/Mapas.jsx`
- `src/pages/MapaForm.jsx`
- `src/pages/MapPointForm.jsx`
- `src/components/MapViewer.jsx`
- `src/components/MapPopup.jsx`

**Modificar:**
- `src/main.jsx` — import leaflet CSS
- `src/seed.js` — añadir `mapas: []` y `map_points: []` a `defaultData` (línea 120)
- `src/App.jsx` — COLLECTIONS (línea 36), PAGES (línea 48), maybeSeed (línea 78), import Mapas, `openForm` (línea 377)
- `src/components/Sidebar.jsx` — NAV sección Mundo (líneas 22-27)
- `src/components/FormModal.jsx` — FORM_TITLES (línea 514), FORM_COMPONENTS (línea 524)
- `src/components/wikiHelpers.js` — COLLECTION_LETTER (línea 1), COLLECTION_DISPLAY (línea 24)

---

## Conversiones de coordenadas Leaflet

Estas constantes/funciones se usan en `MapViewer.jsx`. Copiar exactamente:

```js
const MAP_BOUNDS = [[0, 0], [1000, 1000]]
const toLeaflet = (x, y) => [(1 - y) * 1000, x * 1000]
const fromLeaflet = (latlng) => ({ x: latlng.lng / 1000, y: 1 - latlng.lat / 1000 })

const PIN_COLORS = {
  lugar: '#dc2626', pnj: '#22c55e', faccion: '#f59e0b',
  lore: '#3b82f6', item: '#06b6d4', sesion: '#6b7280', mapa: '#eab308',
}
const PIN_DEFAULT = '#e5e7eb'

function pinIcon(color, ghost = false) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:34px">
      <div style="width:22px;height:26px;background:${color};
        border-radius:50% 50% 50% 50%/60% 60% 40% 40%;
        border:2.5px ${ghost ? 'dashed' : 'solid'} rgba(255,255,255,${ghost ? '0.5' : '0.9'});
        opacity:${ghost ? 0.6 : 1};box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>
      <div style="position:absolute;bottom:0;left:5px;width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:9px solid ${color};opacity:${ghost ? 0.6 : 1}"></div>
    </div>`,
    iconSize: [22, 34],
    iconAnchor: [11, 34],
  })
}
```

---

## FASE 1 — Infraestructura + viewer funcional

---

### Task 1: Instalar dependencias + CSS

**Files:**
- Modify: `package.json` (via npm)
- Modify: `src/main.jsx`

- [ ] **Instalar paquetes**

```bash
cd "e:/Claude Cowork/Drakterima/dragones-wiki"
npm install leaflet react-leaflet
```

Verificar que termina sin errores.

- [ ] **Importar CSS de Leaflet en main.jsx**

Agregar después de `import './styles.css'`:

```js
import 'leaflet/dist/leaflet.css'
```

Resultado final de `src/main.jsx`:
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import 'leaflet/dist/leaflet.css'
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Verificar:** `npm run dev` arranca sin errores de importación.

- [ ] **Commit**

```bash
git add src/main.jsx package.json package-lock.json
git commit -m "chore: instalar leaflet y react-leaflet"
```

---

### Task 2: Seed data + Firestore wiring

**Files:**
- Modify: `src/seed.js:120-130`
- Modify: `src/App.jsx:36` (COLLECTIONS)
- Modify: `src/App.jsx:78-104` (maybeSeed + onSnapshot)
- Modify: `src/components/wikiHelpers.js`

- [ ] **seed.js — añadir mapas y map_points a defaultData**

Reemplazar el bloque `defaultData` (línea 120):

```js
export const defaultData = {
  sesiones: [],
  pjs: [],
  pnjs: [],
  lugares: defaultLugares,
  facciones: defaultFacciones,
  lore: defaultLore,
  items: [],
  player_notes: [],
  login_logs: [],
  mapas: [],
  map_points: [],
}
```

- [ ] **App.jsx — extender COLLECTIONS (línea 36)**

```js
const COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'player_notes', 'login_logs', 'game_logs', 'game_pot', 'game_config', 'mapas', 'map_points']
```

- [ ] **App.jsx — añadir seedCollectionIfEmpty en maybeSeed (después de línea 92)**

Dentro de `async function maybeSeed()`, al final del bloque antes del cierre `}`:

```js
await seedCollectionIfEmpty('mapas', [])
await seedCollectionIfEmpty('map_points', [])
```

- [ ] **wikiHelpers.js — añadir mapas**

```js
export const COLLECTION_LETTER = {
  sesiones:   'S',
  pjs:        'P',
  pnjs:       'N',
  lugares:    'G',
  facciones:  'F',
  lore:       'L',
  items:      'I',
  mapas:      'M',
}

// LETTER_COLLECTION se genera automáticamente del objeto anterior — sin cambios

export const COLLECTION_DISPLAY = {
  sesiones:   'Sesión',
  pjs:        'Personaje Jugador',
  pnjs:       'PNJ',
  lugares:    'Lugar',
  facciones:  'Facción',
  lore:       'Lore',
  items:      'Item',
  mapas:      'Mapa',
}
```

- [ ] **Verificar:** `npm run dev` sin errores. Abrir la app — no debe haber cambios visibles aún.

- [ ] **Commit**

```bash
git add src/seed.js src/App.jsx src/components/wikiHelpers.js
git commit -m "feat: colecciones mapas y map_points — seed, Firestore, wikiHelpers"
```

---

### Task 3: MapaForm.jsx (campos básicos, sin EstadoField)

**Files:**
- Create: `src/pages/MapaForm.jsx`

- [ ] **Crear src/pages/MapaForm.jsx**

```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { FormGroup, FormRow } from '../components/FormModal'
import { inputCls, labelCls, btnPrimary, btnSecondary, btnDanger } from '../constants'

export default function MapaForm({ item, prefill }) {
  const { save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    nombre:     item?.nombre     ?? '',
    imagen_url: item?.imagen_url ?? '',
    descripcion: item?.descripcion ?? '',
    notas:      item?.notas      ?? '',
    is_default: item?.is_default ?? false,
    estado:     item?.estado     ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormGroup>
        <label className={labelCls}>Nombre</label>
        <input className={inputCls} value={f.nombre} onChange={set('nombre')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>URL de imagen del mapa</label>
        <input className={inputCls} type="url" placeholder="https://..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[120px] rounded object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Descripción</label>
        <textarea className={`${inputCls} resize-y min-h-[80px]`} rows={3} value={f.descripcion} onChange={set('descripcion')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Notas internas (solo DM)</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.notas} onChange={set('notas')} />
      </FormGroup>
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('mapas', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('mapas', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}
```

- [ ] **Verificar:** el archivo existe sin errores de lint.

---

### Task 4: MapPointForm.jsx (campos básicos, sin EstadoField)

**Files:**
- Create: `src/pages/MapPointForm.jsx`

El formulario recibe `prefill` con `{ map_id, x, y }` cuando se crea desde click-to-place.

- [ ] **Crear src/pages/MapPointForm.jsx**

```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { FormGroup, FormRow } from '../components/FormModal'
import { inputCls, labelCls, btnPrimary, btnSecondary, btnDanger } from '../constants'

const LINK_TYPES = [
  { value: '',        label: 'Sin link' },
  { value: 'lugar',   label: 'Lugar' },
  { value: 'pnj',     label: 'PNJ' },
  { value: 'faccion', label: 'Facción' },
  { value: 'lore',    label: 'Lore' },
  { value: 'item',    label: 'Ítem' },
  { value: 'sesion',  label: 'Sesión' },
  { value: 'mapa',    label: 'Mapa' },
]

const COLL_MAP = {
  lugar: 'lugares', pnj: 'pnjs', faccion: 'facciones',
  lore: 'lore', item: 'items', sesion: 'sesiones', mapa: 'mapas',
}

const LABEL_KEY = {
  lugar: 'nombre', pnj: 'nombre', faccion: 'nombre',
  lore: 'titulo', item: 'nombre', sesion: 'titulo', mapa: 'nombre',
}

export default function MapPointForm({ item, prefill }) {
  const { db, save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    map_id:      item?.map_id      ?? prefill?.map_id ?? null,
    nombre:      item?.nombre      ?? '',
    descripcion: item?.descripcion ?? '',
    x:           item?.x           ?? prefill?.x ?? 0.5,
    y:           item?.y           ?? prefill?.y ?? 0.5,
    link_type:   item?.link_type   ?? '',
    link_id:     item?.link_id     ?? null,
    estado:      item?.estado      ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  const coll = COLL_MAP[f.link_type]
  const entities = coll ? (db[coll] ?? []) : []
  const labelKey = LABEL_KEY[f.link_type] ?? 'nombre'

  return (
    <div>
      <FormGroup>
        <label className={labelCls}>Nombre del punto</label>
        <input className={inputCls} value={f.nombre} onChange={set('nombre')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Descripción</label>
        <textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.descripcion} onChange={set('descripcion')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Posición en el mapa (solo lectura)</label>
        <div className="text-[12px] text-txt-muted font-mono">
          x: {f.x.toFixed(3)} · y: {f.y.toFixed(3)}
        </div>
      </FormGroup>
      <FormRow>
        <div>
          <label className={labelCls}>Tipo de enlace</label>
          <select className={inputCls} value={f.link_type} onChange={e => setF(p => ({ ...p, link_type: e.target.value, link_id: null }))}>
            {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {f.link_type && (
          <div>
            <label className={labelCls}>Entidad vinculada</label>
            <select className={inputCls} value={f.link_id ?? ''} onChange={e => setF(p => ({ ...p, link_id: Number(e.target.value) || null }))}>
              <option value="">— elegir —</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e[labelKey] || `(id ${e.id})`}</option>)}
            </select>
          </div>
        )}
      </FormRow>
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('map_points', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('map_points', { ...f, id: item?.id, link_type: f.link_type || null })}>Guardar</button>
      </div>
    </div>
  )
}
```

---

### Task 5: FormModal wiring + openForm prefill

**Files:**
- Modify: `src/components/FormModal.jsx:514-533`
- Modify: `src/App.jsx:377-380`

- [ ] **FormModal.jsx — añadir FORM_TITLES y FORM_COMPONENTS para mapas/map_points**

Reemplazar el bloque `FORM_TITLES` (líneas 514-522):

```js
const FORM_TITLES = {
  sesiones:   ['Nueva Sesión', 'Editar Sesión'],
  avances:    ['Nuevo Avance', 'Editar Avance'],
  pnjs:       ['Nuevo PNJ', 'Editar PNJ'],
  lugares:    ['Nuevo Lugar', 'Editar Lugar'],
  facciones:  ['Nueva Facción', 'Editar Facción'],
  lore:       ['Nueva Entrada de Lore', 'Editar Lore'],
  items:      ['Nuevo Ítem', 'Editar Ítem'],
  mapas:      ['Nuevo Mapa', 'Editar Mapa'],
  map_points: ['Nuevo Punto', 'Editar Punto'],
}
```

Añadir imports al inicio del archivo (junto al resto de imports de forms):

```js
import MapaForm from '../pages/MapaForm'
import MapPointForm from '../pages/MapPointForm'
```

Reemplazar el bloque `FORM_COMPONENTS` (líneas 524-533):

```js
const FORM_COMPONENTS = {
  sesiones:   SesionForm,
  avances:    AvanceForm,
  pjs:        PJForm,
  pnjs:       PNJForm,
  lugares:    LugarForm,
  facciones:  FaccionForm,
  lore:       LoreForm,
  items:      ItemForm,
  mapas:      MapaForm,
  map_points: MapPointForm,
}
```

- [ ] **FormModal.jsx — pasar prefill al FormComponent**

Buscar la línea que renderiza `<FormComponent` (aproximadamente línea 588-589):

```jsx
{FormComponent
  ? <FormComponent item={item} openPicker={isPJForm ? () => setPickerOpen(true) : undefined} />
```

Reemplazar por:

```jsx
{FormComponent
  ? <FormComponent item={item} prefill={form.prefill ?? null} openPicker={isPJForm ? () => setPickerOpen(true) : undefined} />
```

- [ ] **App.jsx — extender openForm para aceptar prefill (línea 377)**

```js
openForm: (type, id = null, prefill = null) => {
  if (isDM || (type === 'pjs' && id === currentPlayer?.id)) setForm({ type, id, prefill })
},
```

- [ ] **Verificar:** `npm run dev`. Abrir sidebar → aún no aparece "Mapas" (se agrega en Task 6). Navegar a Lugares → crear nuevo lugar → formulario funciona igual que antes.

- [ ] **Commit**

```bash
git add src/components/FormModal.jsx src/pages/MapaForm.jsx src/pages/MapPointForm.jsx src/App.jsx
git commit -m "feat: formularios MapaForm y MapPointForm, wiring en FormModal"
```

---

### Task 6: Sidebar + App.jsx — wiring de páginas

**Files:**
- Modify: `src/components/Sidebar.jsx:22-27`
- Modify: `src/App.jsx:14-25` (imports) y `src/App.jsx:48-60` (PAGES)

- [ ] **Sidebar.jsx — añadir mapas a la sección Mundo**

Reemplazar la sección Mundo (líneas 22-27):

```js
{
  section: 'Mundo', items: [
    { id: 'mapas',    icon: Map,      label: 'Mapas',     count: true },
    { id: 'lugares',  icon: Map,      label: 'Lugares',   count: true },
    { id: 'facciones', icon: Landmark, label: 'Facciones', count: true },
    { id: 'lore',     icon: BookOpen, label: 'Lore',      count: true },
  ]
},
```

Nota: `Map` ya está importado en Sidebar.jsx (línea 3). Si se desea un ícono distinto para mapas se puede importar `Globe` o `MapPin` de lucide-react. Por ahora usa `Map`.

- [ ] **App.jsx — importar Mapas y añadir a PAGES**

Añadir el import después de los otros imports de páginas (después de línea 25):

```js
import Mapas from './pages/Mapas'
```

Reemplazar el bloque `PAGES` (líneas 48-60):

```js
const PAGES = {
  dashboard: Dashboard,
  zonaDM:    ZonaDM,
  notas:     Notas,
  sesiones:  Sesiones,
  pjs:       PJs,
  pnjs:      PNJs,
  mapas:     Mapas,
  lugares:   Lugares,
  facciones: Facciones,
  lore:      Lore,
  items:     Items,
  juegos:    Juegos,
}
```

**Importante:** `Mapas.jsx` aún no existe — este paso hará que `npm run dev` falle hasta que se cree en Task 10. Los Tasks 7-9 crean los archivos que Mapas.jsx necesita. Podés crear un placeholder temporario:

```jsx
// src/pages/Mapas.jsx (placeholder — reemplazar en Task 10)
export default function Mapas() {
  return <div className="p-8 text-txt-primary">Mapas (en construcción)</div>
}
```

- [ ] **Verificar:** `npm run dev`. El sidebar muestra "Mapas". Navegar a Mapas → mensaje "en construcción". El contador del sidebar muestra 0.

- [ ] **Commit**

```bash
git add src/components/Sidebar.jsx src/App.jsx src/pages/Mapas.jsx
git commit -m "feat: wiring Mapas en sidebar y páginas (placeholder)"
```

---

### Task 7: MapPopup.jsx

**Files:**
- Create: `src/components/MapPopup.jsx`

El popup recibe el punto clickeado y los datos de la entidad linkeada. Se renderiza como componente React, no como popup de Leaflet. Su posicionamiento lo controla `MapViewer.jsx`.

- [ ] **Crear src/components/MapPopup.jsx**

```jsx
import { useApp } from '../AppContext'
import { btnPrimary, btnSecondary } from '../constants'

const COLLECTION_PAGE = {
  lugar: 'lugares', pnj: 'pnjs', faccion: 'facciones',
  lore: 'lore', item: 'items', sesion: 'sesiones',
}

const TYPE_ICON = {
  lugar: '🏰', pnj: '👤', faccion: '⚔️',
  lore: '📜', item: '💎', sesion: '📖', mapa: '🗺',
}

export default function MapPopup({ point, db, isDM, onNavigateToMap, onEditPoint, onClose }) {
  const { goToDetail } = useApp()

  const linkedEntity = point.link_type && point.link_id
    ? (db[COLLECTION_PAGE[point.link_type] ?? 'mapas'] ?? []).find(e => e.id === point.link_id)
    : null

  const isMapa = point.link_type === 'mapa'
  const icon = TYPE_ICON[point.link_type] ?? '📍'

  function handlePrimary() {
    if (isMapa) {
      const mapa = db.mapas.find(m => m.id === point.link_id)
      if (mapa) onNavigateToMap(mapa.id, mapa.nombre)
    } else if (point.link_type && COLLECTION_PAGE[point.link_type] && point.link_id) {
      goToDetail(COLLECTION_PAGE[point.link_type], point.link_id)
    }
    onClose()
  }

  const hasPrimaryAction = (isMapa || (point.link_type && point.link_id))

  return (
    <div
      className="bg-[#1a1a1a] border border-[#333] rounded-md shadow-xl overflow-hidden"
      style={{ width: 200, pointerEvents: 'auto' }}
    >
      {/* Arrow pointing down to pin */}
      <div style={{
        position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
        borderTop: '6px solid #333',
      }} />
      <div style={{
        position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: '5px solid #1a1a1a', zIndex: 1,
      }} />

      {/* Close button */}
      <button
        className="absolute top-1.5 right-2 text-[#555] hover:text-[#aaa] text-xs"
        onClick={onClose}
        style={{ zIndex: 2 }}
      >✕</button>

      {/* Image / icon header */}
      <div className="h-12 flex items-center justify-center text-2xl"
        style={{ background: linkedEntity?.imagen_url ? undefined : 'linear-gradient(135deg, #1f2f18, #0f1c0a)' }}
      >
        {linkedEntity?.imagen_url
          ? <img src={linkedEntity.imagen_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
          : icon}
      </div>

      {/* Content */}
      <div className="px-3 pt-2 pb-3">
        {linkedEntity && (
          <div className="text-[10px] text-txt-muted uppercase tracking-wider mb-0.5 font-mono">
            {point.link_type}
            {linkedEntity.region ? ` · ${linkedEntity.region}` : ''}
            {linkedEntity.categoria ? ` · ${linkedEntity.categoria}` : ''}
          </div>
        )}
        <div className="text-[13px] font-bold text-txt-primary mb-1 leading-tight">
          {point.nombre}
        </div>
        {point.descripcion && (
          <div className="text-[11px] text-txt-muted leading-snug mb-2 line-clamp-2">
            {point.descripcion}
          </div>
        )}
        <div className="flex gap-1.5">
          {hasPrimaryAction && (
            <button className={btnPrimary} style={{ fontSize: 11, padding: '4px 8px', flex: 1 }} onClick={handlePrimary}>
              {isMapa ? 'Abrir mapa' : 'Ver artículo'}
            </button>
          )}
          {isDM && (
            <button className={btnSecondary} style={{ fontSize: 11, padding: '4px 8px' }} onClick={onEditPoint}>
              ✏
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

### Task 8: MapViewer.jsx

**Files:**
- Create: `src/components/MapViewer.jsx`

Este es el componente central. Usa react-leaflet con CRS.Simple. Maneja:
- Render del mapa con imageOverlay
- Markers (pins) por punto
- Popup React posicionado absolutamente
- Ghost pin draggable para click-to-place
- Breadcrumb y toolbar DM como overlays

- [ ] **Crear src/components/MapViewer.jsx**

```jsx
import { useRef, useState } from 'react'
import { MapContainer, ImageOverlay, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useApp } from '../AppContext'
import MapPopup from './MapPopup'
import { btnPrimary, btnSecondary } from '../constants'

const MAP_BOUNDS = [[0, 0], [1000, 1000]]
const toLeaflet = (x, y) => [(1 - y) * 1000, x * 1000]
const fromLeaflet = (latlng) => ({ x: latlng.lng / 1000, y: 1 - latlng.lat / 1000 })

const PIN_COLORS = {
  lugar: '#dc2626', pnj: '#22c55e', faccion: '#f59e0b',
  lore: '#3b82f6', item: '#06b6d4', sesion: '#6b7280', mapa: '#eab308',
}
const PIN_DEFAULT = '#e5e7eb'

function pinIcon(color, ghost = false) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:34px">
      <div style="width:22px;height:26px;background:${color};
        border-radius:50% 50% 50% 50%/60% 60% 40% 40%;
        border:2.5px ${ghost ? 'dashed' : 'solid'} rgba(255,255,255,${ghost ? '0.5' : '0.9'});
        opacity:${ghost ? 0.6 : 1};box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>
      <div style="position:absolute;bottom:0;left:5px;width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:9px solid ${color};opacity:${ghost ? 0.6 : 1}"></div>
    </div>`,
    iconSize: [22, 34],
    iconAnchor: [11, 34],
  })
}

// Handles map click events — close popup + add-point mode
// IMPORTANTE: MapContainer no soporta onClick como prop React.
// Todos los eventos del mapa deben manejarse con useMapEvents dentro del container.
function MapClickHandler({ addMode, hasGhost, onMapClick, onClose }) {
  useMapEvents({
    click(e) {
      onClose()  // siempre cerrar popup al hacer click en el mapa
      if (addMode && !hasGhost) onMapClick(e.latlng)
    },
  })
  return null
}

export default function MapViewer({
  mapa, points, isDM, db,
  onNavigateToMap, onEditMap, onAddPoint,
  breadcrumb, onBreadcrumbClick,
}) {
  const { openForm } = useApp()
  const [popup, setPopup] = useState(null)       // { x, y, point }
  const [addMode, setAddMode] = useState(false)
  const [ghostPos, setGhostPos] = useState(null) // L.LatLng
  const ghostRef = useRef(null)

  function handleMapClick(latlng) {
    setGhostPos(latlng)
  }

  function handleGhostDragEnd() {
    if (ghostRef.current) setGhostPos(ghostRef.current.getLatLng())
  }

  function handleConfirmGhost() {
    const finalLatlng = ghostRef.current ? ghostRef.current.getLatLng() : ghostPos
    const { x, y } = fromLeaflet(finalLatlng)
    openForm('map_points', null, { map_id: mapa.id, x, y })
    setGhostPos(null)
    setAddMode(false)
  }

  function handleCancelGhost() {
    setGhostPos(null)
  }

  function toggleAddMode() {
    setAddMode(m => !m)
    setGhostPos(null)
    setPopup(null)
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        crs={L.CRS.Simple}
        bounds={MAP_BOUNDS}
        style={{ height: '100%', width: '100%', background: '#0a0a0a', cursor: addMode && !ghostPos ? 'crosshair' : 'grab' }}
        zoomSnap={0.25}
        minZoom={-3}
        maxZoom={4}
        attributionControl={false}
      >
        <ImageOverlay url={mapa.imagen_url} bounds={MAP_BOUNDS} />
        <MapClickHandler addMode={addMode} hasGhost={!!ghostPos} onMapClick={handleMapClick} onClose={() => setPopup(null)} />

        {/* Regular point markers */}
        {points.map(pt => {
          const color = PIN_COLORS[pt.link_type] ?? PIN_DEFAULT
          return (
            <Marker
              key={pt.id}
              position={toLeaflet(pt.x, pt.y)}
              icon={pinIcon(color)}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation()
                  setPopup({ x: e.containerPoint.x, y: e.containerPoint.y, point: pt })
                },
              }}
            />
          )
        })}

        {/* Ghost pin for click-to-place */}
        {ghostPos && (
          <Marker
            position={ghostPos}
            icon={pinIcon(PIN_DEFAULT, true)}
            draggable={true}
            ref={ghostRef}
            eventHandlers={{ dragend: handleGhostDragEnd }}
          />
        )}
      </MapContainer>

      {/* React popup overlay */}
      {popup && (
        <div
          style={{
            position: 'absolute',
            left: popup.x,
            top: popup.y,
            transform: 'translate(-50%, calc(-100% - 36px))',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <MapPopup
            point={popup.point}
            db={db}
            isDM={isDM}
            onNavigateToMap={onNavigateToMap}
            onEditPoint={() => { openForm('map_points', popup.point.id); setPopup(null) }}
            onClose={() => setPopup(null)}
          />
        </div>
      )}

      {/* Breadcrumb overlay (top-left) */}
      {breadcrumb.length > 0 && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,0,0,0.75)', border: '1px solid #333',
          borderRadius: 4, padding: '3px 8px', backdropFilter: 'blur(4px)',
        }}>
          {breadcrumb.map((entry, i) => (
            <span key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: '#555', fontSize: 11 }}>›</span>}
              <button
                style={{
                  fontSize: 11, color: i === breadcrumb.length - 1 ? '#fff' : '#888',
                  background: 'none', border: 'none', cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default',
                  fontFamily: 'monospace',
                }}
                onClick={() => i < breadcrumb.length - 1 && onBreadcrumbClick(i)}
              >
                {i === 0 ? '🗺 ' : ''}{entry.nombre}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Ghost pin confirm/cancel overlay */}
      {ghostPos && (
        <div style={{
          position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(0,0,0,0.85)', border: '1px solid #444',
          borderRadius: 6, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>
            Arrastrar para mover
          </span>
          <button className={btnPrimary} style={{ fontSize: 11, padding: '4px 10px' }} onClick={handleConfirmGhost}>
            Confirmar posición
          </button>
          <button className={btnSecondary} style={{ fontSize: 11, padding: '4px 8px' }} onClick={handleCancelGhost}>
            Cancelar
          </button>
        </div>
      )}

      {/* DM toolbar (bottom-center) */}
      {isDM && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 900, background: 'rgba(0,0,0,0.82)', border: '1px solid #333',
          borderRadius: 6, padding: '5px 10px', display: 'flex', gap: 8, alignItems: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginRight: 2 }}>DM</span>
          <div style={{ width: 1, height: 14, background: '#333' }} />
          <button
            className={addMode ? btnPrimary : btnSecondary}
            style={{ fontSize: 11, padding: '3px 9px' }}
            onClick={toggleAddMode}
          >
            {addMode ? '× Cancelar' : '+ Agregar punto'}
          </button>
          <button className={btnSecondary} style={{ fontSize: 11, padding: '3px 9px' }} onClick={onEditMap}>
            ⚙ Editar mapa
          </button>
        </div>
      )}
    </div>
  )
}
```

---

### Task 9: Mapas.jsx (versión completa — reemplaza placeholder)

**Files:**
- Modify: `src/pages/Mapas.jsx` (reemplazar el placeholder del Task 6)

- [ ] **Reemplazar src/pages/Mapas.jsx**

```jsx
import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { isVisible } from '../helpers'
import MapViewer from '../components/MapViewer'
import { btnPrimary, btnSecondary } from '../constants'
import { Map } from 'lucide-react'

function MapCard({ mapa, onSelect }) {
  return (
    <div
      className="bg-bg-mid border border-border-base rounded cursor-pointer hover:border-accent transition-colors overflow-hidden"
      onClick={() => onSelect(mapa)}
    >
      {mapa.imagen_url
        ? <img src={mapa.imagen_url} alt={mapa.nombre} className="w-full h-32 object-cover" onError={e => e.target.style.display = 'none'} />
        : <div className="w-full h-32 bg-[#111] flex items-center justify-center text-3xl">🗺</div>
      }
      <div className="px-3 py-2">
        <div className="font-exo text-sm font-semibold text-txt-primary">{mapa.nombre}</div>
        {mapa.descripcion && <div className="text-xs text-txt-muted mt-0.5 line-clamp-1">{mapa.descripcion}</div>}
      </div>
    </div>
  )
}

export default function Mapas() {
  const { db, isDM, currentPlayer, openForm } = useApp()
  const [stack, setStack] = useState([])  // [{ id, nombre }]

  const allMapas = db.mapas ?? []
  const visibleMapas = allMapas.filter(m => isVisible(m, isDM, currentPlayer))

  // On first load, navigate to the default map if it exists
  useEffect(() => {
    if (stack.length > 0) return
    const def = visibleMapas.find(m => m.is_default)
    if (def) setStack([{ id: def.id, nombre: def.nombre }])
  }, [visibleMapas.length])  // eslint-disable-line

  const currentMapId = stack.length > 0 ? stack[stack.length - 1].id : null
  const activeMap = currentMapId ? visibleMapas.find(m => m.id === currentMapId) : null

  const points = (db.map_points ?? []).filter(p => p.map_id === activeMap?.id)

  function navigateTo(mapId, nombre) {
    setStack(prev => [...prev, { id: mapId, nombre }])
  }

  function onBreadcrumbClick(index) {
    setStack(prev => prev.slice(0, index + 1))
  }

  function selectMap(mapa) {
    setStack([{ id: mapa.id, nombre: mapa.nombre }])
  }

  // Map list view
  if (!activeMap) {
    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-exo text-2xl font-bold text-txt-primary uppercase tracking-wide flex items-center gap-2">
            <Map size={22} className="text-accent-bright" /> Mapas
          </h1>
          {isDM && (
            <button className={btnPrimary} onClick={() => openForm('mapas')}>+ Nuevo mapa</button>
          )}
        </div>
        {visibleMapas.length === 0
          ? <div className="text-txt-muted text-sm">{isDM ? 'No hay mapas. Creá el primero.' : 'No hay mapas disponibles.'}</div>
          : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {visibleMapas.map(m => <MapCard key={m.id} mapa={m} onSelect={selectMap} />)}
            </div>
        }
      </div>
    )
  }

  // Map viewer
  return (
    <div style={{ height: 'calc(100vh - 60px)', overflow: 'hidden', position: 'relative' }}>
      <MapViewer
        mapa={activeMap}
        points={points}
        isDM={isDM}
        db={db}
        onNavigateToMap={navigateTo}
        onEditMap={() => openForm('mapas', activeMap.id)}
        onAddPoint={() => {}}  // handled internally by MapViewer
        breadcrumb={stack}
        onBreadcrumbClick={onBreadcrumbClick}
      />
      {/* Back to list button */}
      {stack.length === 1 && (
        <button
          className={btnSecondary}
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 900, fontSize: 11 }}
          onClick={() => setStack([])}
        >
          ← Lista de mapas
        </button>
      )}
    </div>
  )
}
```

- [ ] **Verificar en browser:**
  1. `npm run dev` → navegar a "Mapas" en el sidebar
  2. Crear un mapa (DM mode) con una imagen URL pública. Ej: cualquier imagen de https://i.imgur.com/
  3. El mapa aparece en la lista → hacer click → el viewer de Leaflet carga la imagen con zoom/pan
  4. Toolbar DM visible. Click "+ Agregar punto" → cursor cambia a crosshair
  5. Click en el mapa → aparece pin fantasma punteado
  6. Arrastrar el pin → se reposiciona
  7. "Confirmar posición" → se abre el formulario de punto con x/y precargados (solo lectura)
  8. Guardar punto → pin aparece en el mapa
  9. Click en el pin → popup aparece con nombre del punto
  10. Si el punto linkea a otro mapa: "Abrir mapa" navega al sub-mapa y actualiza breadcrumb
  11. Click en segmento del breadcrumb → vuelve a ese mapa

- [ ] **Commit Phase 1**

```bash
git add src/pages/Mapas.jsx src/components/MapViewer.jsx src/components/MapPopup.jsx
git commit -m "feat: mapas interactivos — viewer Leaflet, pins, popup, click-to-place, breadcrumb [Fase 1]"
```

---

## FASE 2 — Visibilidad + pulido

---

### Task 10: EstadoField en formularios + is_default

**Files:**
- Modify: `src/pages/MapaForm.jsx`
- Modify: `src/pages/MapPointForm.jsx`
- Modify: `src/pages/Mapas.jsx` (lógica is_default)

- [ ] **MapaForm.jsx — añadir EstadoField e is_default**

Añadir import al inicio:
```js
import { FormGroup, FormRow, EstadoField } from '../components/FormModal'
import { inputCls, labelCls, btnPrimary, btnSecondary, btnDanger } from '../constants'
```

Añadir campo `is_default` y `EstadoField` antes del div de botones:

```jsx
<FormGroup>
  <label className="flex items-center gap-2 text-[13px] text-txt-primary cursor-pointer">
    <input
      type="checkbox"
      checked={f.is_default}
      onChange={e => setF(p => ({ ...p, is_default: e.target.checked }))}
    />
    Mapa por defecto (se abre al entrar a la sección)
  </label>
</FormGroup>
<EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
```

- [ ] **MapPointForm.jsx — añadir EstadoField**

Añadir import:
```js
import { FormGroup, FormRow, EstadoField } from '../components/FormModal'
```

Añadir antes del div de botones:
```jsx
<EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
```

- [ ] **Commit**

```bash
git add src/pages/MapaForm.jsx src/pages/MapPointForm.jsx
git commit -m "feat: EstadoField e is_default en formularios de mapas"
```

---

### Task 11: Visibilidad de puntos en el viewer

**Files:**
- Modify: `src/components/MapViewer.jsx`

Los puntos `borrador` solo los ve el DM (atenuados, opacity 0.4). Los puntos `secreto` que el player no tiene acceso: ocultos para players, atenuados para DM.

- [ ] **MapViewer.jsx — filtrar/atenuar puntos según visibilidad**

En el bloque donde se renderizan los markers, antes del `points.map(...)`, añadir la función de filtrado:

```js
// Determinar opacidad del pin según estado y rol
function pinOpacity(pt) {
  if (pt.estado === 'borrador') return isDM ? 0.4 : null  // null = no renderizar
  if (pt.estado === 'secreto') {
    if (isDM) return 0.4
    // player check
    const playerId = !isDM && db.pjs ? db.pjs.find(pj => pj.id === (db.currentPlayer?.id))?.id : null
    if (pt.visibilidad?.includes(playerId)) return 1
    return null  // no renderizar
  }
  return 1  // publicado
}
```

Reemplazar el `.map(pt => ...)` de markers:

```jsx
{points.map(pt => {
  const opacity = pinOpacity(pt)
  if (opacity === null) return null

  const color = PIN_COLORS[pt.link_type] ?? PIN_DEFAULT
  return (
    <Marker
      key={pt.id}
      position={toLeaflet(pt.x, pt.y)}
      icon={pinIcon(color)}
      opacity={opacity}
      eventHandlers={{
        click: (e) => {
          e.originalEvent?.stopPropagation()
          setPopup({ x: e.containerPoint.x, y: e.containerPoint.y, point: pt })
        },
      }}
    />
  )
})}
```

Nota: `MapViewer` necesita acceso a `currentPlayer` para el check de secreto. Pasarlo como prop desde `Mapas.jsx`:

En `Mapas.jsx`, pasar `currentPlayer` a MapViewer:
```jsx
<MapViewer
  ...
  currentPlayer={currentPlayer}
/>
```

En `MapViewer.jsx`, añadir `currentPlayer` a las props destructuradas y usarlo en `pinOpacity`:

```js
function pinOpacity(pt) {
  if (pt.estado === 'borrador') return isDM ? 0.4 : null
  if (pt.estado === 'secreto') {
    if (isDM) return 0.4
    if (currentPlayer && pt.visibilidad?.includes(currentPlayer.id)) return 1
    return null
  }
  return 1
}
```

- [ ] **Verificar:**
  1. Crear un punto con `estado: 'borrador'` → DM lo ve atenuado, jugadores no lo ven
  2. Crear un punto con `estado: 'secreto'` y un PJ específico → ese PJ lo ve, los demás no

- [ ] **Commit**

```bash
git add src/components/MapViewer.jsx src/pages/Mapas.jsx
git commit -m "feat: visibilidad de puntos en el viewer (borrador/secreto)"
```

---

### Task 12: Squash final de la rama

Una vez que Fase 1 y Fase 2 están completos y verificados en browser:

- [ ] **Squash all commits into one**

```bash
# Obtener el SHA del commit base (el último commit de main antes de esta rama)
git log --oneline main..HEAD
# Copiar el SHA más antiguo visible, luego:
git reset --soft $(git merge-base HEAD main)
git commit -m "feat: mapas interactivos con Leaflet — viewer, pins, popup, click-to-place, visibilidad"
```

- [ ] **Verificar que el app sigue funcionando** después del squash con `npm run dev`.
