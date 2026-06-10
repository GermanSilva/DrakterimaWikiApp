# Sesiones/Avances — Tipos, ordenamiento y filtros — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar tipo `'avance'` (teaser narrativo) a la colección `sesiones`, ordenamiento manual por campo `orden` float con dropdown "va después de X", filtros por tipo en la lista, y botones prev/next en la vista de detalle.

**Architecture:** Se agrega `orden: float` a todas las entradas de `sesiones`; el sort en App.jsx usa `orden` con fallback `numero * 100`. Un pseudo-tipo `'avances'` en FormModal permite distinguir los formularios sin crear una colección Firestore separada. Sesiones.jsx gestiona el filtro local y calcula prevId/nextId desde la lista visible.

**Tech Stack:** React 18, Vite 5, Firestore (onSnapshot), Tailwind CSS, lucide-react.

---

## Archivos que cambian

| Archivo | Qué hace |
|---|---|
| `src/helpers.js` | Nueva función `calcularOrden` |
| `src/seed.js` | Agrega `tipo: 'sesion'` y `orden` a `seedSesiones` |
| `src/App.jsx` | Sort de sesiones usa `orden` con fallback |
| `src/components/FormModal.jsx` | Fix item lookup para 'avances'; nuevo `PosicionField`; nuevo `AvanceForm`; actualiza `SesionForm`; registra en `FORM_COMPONENTS`/`FORM_TITLES` |
| `src/pages/Sesiones.jsx` | Tabs de filtro, distinción visual en cards, rama avance en detalle, prev/next, botón "+ Nuevo Avance" |

---

## Task 1: `calcularOrden` en helpers.js

**Files:**
- Modify: `src/helpers.js`

- [ ] **Step 1: Agregar `calcularOrden` al final de `src/helpers.js`**

```js
// src/helpers.js — agregar al final del archivo

export function calcularOrden(afterId, sortedArticulos) {
  if (!sortedArticulos.length) return 100
  const getOrden = a => a.orden ?? a.numero * 100
  if (afterId === null) return getOrden(sortedArticulos[0]) - 100
  const idx = sortedArticulos.findIndex(a => a.id === afterId)
  if (idx === -1) return getOrden(sortedArticulos[sortedArticulos.length - 1]) + 100
  const afterOrden = getOrden(sortedArticulos[idx])
  if (idx === sortedArticulos.length - 1) return afterOrden + 100
  return (afterOrden + getOrden(sortedArticulos[idx + 1])) / 2
}
```

`sortedArticulos` debe pasarse ya ordenado por `orden` (con fallback) y **sin** el artículo que se está editando.

- [ ] **Step 2: Verificar dev server sin errores**

```bash
npm run dev
```

Esperado: servidor inicia sin errores de consola.

- [ ] **Step 3: Commit**

```bash
git add src/helpers.js
git commit -m "feat: calcularOrden helper para posicionamiento de articulos"
```

---

## Task 2: seed.js — agregar `tipo` y `orden` a seedSesiones

**Files:**
- Modify: `src/seed.js`

- [ ] **Step 1: Actualizar el objeto en `seedSesiones`**

En `src/seed.js`, la línea 117 tiene el objeto de la sesión seed. Agregarle los campos `tipo` y `orden` al inicio:

```js
export const seedSesiones = [
  { id: 1, tipo: 'sesion', orden: 100, numero: 1, fecha: '', titulo: 'El Escuadrón Incompleto', resumen: 'MISIÓN: Auditoría externa...', logros: '', ganchos: 'GANCHOS PARA SIGUIENTE SESIÓN...' },
]
```

Solo se agregan `tipo: 'sesion'` y `orden: 100` al objeto — el resto del contenido del objeto (resumen, ganchos largos) se deja exactamente igual.

- [ ] **Step 2: Commit**

```bash
git add src/seed.js
git commit -m "feat: agregar tipo y orden a seedSesiones"
```

---

## Task 3: App.jsx — sort por `orden` con fallback

**Files:**
- Modify: `src/App.jsx` (línea 99)

- [ ] **Step 1: Cambiar el sort de sesiones**

Localizar en `src/App.jsx`:
```js
if (collName === 'sesiones') docs.sort((a, b) => a.numero - b.numero)
```

Reemplazar con:
```js
if (collName === 'sesiones') docs.sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
```

El fallback `a.numero * 100` mantiene el orden correcto para documentos Firestore existentes que todavía no tienen el campo `orden`.

- [ ] **Step 2: Verificar que la lista de sesiones sigue mostrando el orden correcto**

```bash
npm run dev
```

Ir a la sección Sesiones y verificar que el orden visual no cambió.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: sesiones sort por campo orden con fallback a numero*100"
```

---

## Task 4: FormModal — fix item lookup y nuevo `PosicionField`

**Files:**
- Modify: `src/components/FormModal.jsx`

- [ ] **Step 1: Corregir el lookup de `item` para el pseudo-tipo `'avances'`**

En `src/components/FormModal.jsx`, localizar en `FormModal` (cerca de la línea 435):
```js
const item = form.id !== null ? (db[form.type] || []).find(x => x.id === form.id) ?? null : null
```

Reemplazar con:
```js
const collectionKey = form.type === 'avances' ? 'sesiones' : form.type
const item = form.id !== null ? (db[collectionKey] || []).find(x => x.id === form.id) ?? null : null
```

- [ ] **Step 2: Agregar el componente `PosicionField` después de `EstadoField` (antes de `SesionForm`)**

Agregar en `src/components/FormModal.jsx` justo antes de `function SesionForm`:

```jsx
function PosicionField({ afterId, setAfterIdFn, currentId }) {
  const { db } = useApp()
  const sortedAll = [...db.sesiones]
    .sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
    .filter(s => s.id !== currentId)
  return (
    <FormGroup>
      <label className={labelCls}>Posición en la línea de tiempo</label>
      <select
        className={inputCls}
        value={afterId === null ? '__first__' : afterId}
        onChange={e => setAfterIdFn(e.target.value === '__first__' ? null : Number(e.target.value))}
      >
        <option value="__first__">(Al principio)</option>
        {sortedAll.map(s => (
          <option key={s.id} value={s.id}>
            {s.tipo === 'avance'
              ? `[Avance] ${s.titulo || 'Sin título'}`
              : `[Sesión ${s.numero}] ${s.titulo || 'Sin título'}`}
          </option>
        ))}
      </select>
    </FormGroup>
  )
}
```

- [ ] **Step 3: Agregar import de `calcularOrden` en el bloque de imports de FormModal**

Al inicio de `src/components/FormModal.jsx`, en la línea del import de helpers:
```js
import { regionLabel, regionOptions, calcularOrden } from '../helpers'
```

- [ ] **Step 4: Verificar dev server sin errores de consola**

```bash
npm run dev
```

Esperado: sin errores. `PosicionField` no aparece en ningún form todavía.

- [ ] **Step 5: Commit**

```bash
git add src/components/FormModal.jsx
git commit -m "feat: PosicionField y fix item lookup para pseudo-tipo avances"
```

(El import de `calcularOrden` en FormModal.jsx es nuevo, pero `calcularOrden` fue agregado en la Task 1.)

---

## Task 5: FormModal — `AvanceForm`, update `SesionForm`, registraciones

**Files:**
- Modify: `src/components/FormModal.jsx`

- [ ] **Step 1: Reemplazar `SesionForm` completo con la versión que incluye `PosicionField`**

Reemplazar la función `SesionForm` existente:

```jsx
function SesionForm({ item }) {
  const { db, save, remove, closeForm, activeFieldRef } = useApp()
  const sortedAll = [...db.sesiones].sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
  const itemOrden = item ? (item.orden ?? item.numero * 100) : null
  const defaultAfterId = item
    ? (sortedAll.filter(s => s.id !== item.id && (s.orden ?? s.numero * 100) < itemOrden).pop()?.id ?? null)
    : (sortedAll.length > 0 ? sortedAll[sortedAll.length - 1].id : null)
  const [f, setF] = useState({
    numero: item?.numero ?? (db.sesiones.filter(s => s.tipo !== 'avance').length + 1),
    fecha: item?.fecha ?? '',
    titulo: item?.titulo ?? '',
    resumen: item?.resumen ?? '',
    logros: item?.logros ?? '',
    ganchos: item?.ganchos ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
    afterId: defaultAfterId,
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    const forOrden = sortedAll.filter(s => s.id !== item?.id)
    const orden = calcularOrden(f.afterId, forOrden)
    const { afterId, ...rest } = f
    save('sesiones', { ...rest, id: item?.id, numero: parseInt(f.numero) || 0, tipo: 'sesion', orden })
  }

  return (
    <div>
      <FormRow>
        <div>
          <label className={labelCls}>Número de Sesión</label>
          <input className={inputCls} type="number" value={f.numero} onChange={set('numero')} min="0" />
        </div>
        <div>
          <label className={labelCls}>Fecha Real</label>
          <input className={inputCls} type="date" value={f.fecha} onChange={set('fecha')} />
        </div>
      </FormRow>
      <FormGroup>
        <label className={labelCls}>Título de la Sesión</label>
        <input className={inputCls} value={f.titulo} onChange={set('titulo')} placeholder="Ej: La llegada a Kardevir" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Resumen</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.resumen} onChange={set('resumen')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'resumen' } }}
          placeholder="¿Qué ocurrió en la sesión?" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Logros / Momentos importantes</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.logros} onChange={set('logros')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'logros' } }}
          placeholder="Decisiones clave, revelaciones..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>{labelLock}Ganchos pendientes (próxima sesión)</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.ganchos} onChange={set('ganchos')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'ganchos' } }}
          placeholder="¿Qué quedó sin resolver?" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <PosicionField afterId={f.afterId} setAfterIdFn={v => setF(p => ({ ...p, afterId: v }))} currentId={item?.id} />
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('sesiones', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
```

Cambios respecto a la versión original:
- Agrega `afterId` al state inicial, calculado desde el sort actual
- El número default excluye avances del conteo: `db.sesiones.filter(s => s.tipo !== 'avance').length + 1`
- `handleSave` computa `orden` vía `calcularOrden` y omite `afterId` del objeto guardado
- Agrega `<PosicionField>` antes de `<EstadoField>`

- [ ] **Step 2: Agregar `AvanceForm` justo después de `SesionForm`**

```jsx
function AvanceForm({ item }) {
  const { db, save, remove, closeForm, activeFieldRef } = useApp()
  const sortedAll = [...db.sesiones].sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
  const itemOrden = item ? (item.orden ?? item.numero * 100) : null
  const defaultAfterId = item
    ? (sortedAll.filter(s => s.id !== item.id && (s.orden ?? s.numero * 100) < itemOrden).pop()?.id ?? null)
    : (sortedAll.length > 0 ? sortedAll[sortedAll.length - 1].id : null)
  const [f, setF] = useState({
    titulo: item?.titulo ?? '',
    texto: item?.texto ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
    afterId: defaultAfterId,
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    const forOrden = sortedAll.filter(s => s.id !== item?.id)
    const orden = calcularOrden(f.afterId, forOrden)
    const { afterId, ...rest } = f
    save('sesiones', { ...rest, id: item?.id, tipo: 'avance', orden })
  }

  return (
    <div>
      <FormGroup>
        <label className={labelCls}>Título del Avance</label>
        <input className={inputCls} value={f.titulo} onChange={set('titulo')} placeholder="Ej: Algo se acerca..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Texto</label>
        <textarea className={`${inputCls} resize-y min-h-[120px]`} rows={6} value={f.texto} onChange={set('texto')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'texto' } }}
          placeholder="Bloque de lore, diálogo críptico, teaser narrativo..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>{labelLock}Notas del DM</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.notas} onChange={set('notas')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }}
          placeholder="Notas internas..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <PosicionField afterId={f.afterId} setAfterIdFn={v => setF(p => ({ ...p, afterId: v }))} currentId={item?.id} />
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('sesiones', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Registrar `AvanceForm` en `FORM_TITLES` y `FORM_COMPONENTS`**

Reemplazar:
```js
const FORM_TITLES = {
  sesiones: ['Nueva Sesión', 'Editar Sesión'],
  pnjs: ['Nuevo PNJ', 'Editar PNJ'],
  lugares: ['Nuevo Lugar', 'Editar Lugar'],
  facciones: ['Nueva Facción', 'Editar Facción'],
  lore: ['Nueva Entrada de Lore', 'Editar Lore'],
  items: ['Nuevo Ítem', 'Editar Ítem'],
}

const FORM_COMPONENTS = {
  sesiones: SesionForm,
  pjs: PJForm,
  pnjs: PNJForm,
  lugares: LugarForm,
  facciones: FaccionForm,
  lore: LoreForm,
  items: ItemForm,
}
```

Con:
```js
const FORM_TITLES = {
  sesiones: ['Nueva Sesión', 'Editar Sesión'],
  avances: ['Nuevo Avance', 'Editar Avance'],
  pnjs: ['Nuevo PNJ', 'Editar PNJ'],
  lugares: ['Nuevo Lugar', 'Editar Lugar'],
  facciones: ['Nueva Facción', 'Editar Facción'],
  lore: ['Nueva Entrada de Lore', 'Editar Lore'],
  items: ['Nuevo Ítem', 'Editar Ítem'],
}

const FORM_COMPONENTS = {
  sesiones: SesionForm,
  avances: AvanceForm,
  pjs: PJForm,
  pnjs: PNJForm,
  lugares: LugarForm,
  facciones: FaccionForm,
  lore: LoreForm,
  items: ItemForm,
}
```

- [ ] **Step 4: Verificar ambos formularios**

```bash
npm run dev
```

Ir a Sesiones → editar una sesión existente: debe verse el nuevo campo "Posición en la línea de tiempo" con la sesión pre-seleccionada como "la que va antes".

Crear una sesión nueva: el campo debe pre-seleccionar la última sesión existente.

Abrir DevTools y verificar que no hay errores de consola.

- [ ] **Step 5: Commit**

```bash
git add src/components/FormModal.jsx
git commit -m "feat: AvanceForm, PosicionField en SesionForm, registro avances en FormModal"
```

---

## Task 6: Sesiones.jsx — filter tabs y distinción visual en cards

**Files:**
- Modify: `src/pages/Sesiones.jsx`

- [ ] **Step 1: Agregar `tipoFilter` state y las tabs de filtro**

En `Sesiones()`, agregar después del `useEffect`:
```jsx
const [tipoFilter, setTipoFilter] = useState('todos')
```

En el JSX de la lista, antes de `<div className="relative pl-6 timeline-wrap">`, insertar las tabs:

```jsx
<div className="flex gap-1 mb-6">
  {[
    { value: 'todos', label: 'Todos' },
    { value: 'sesion', label: 'Sesiones' },
    { value: 'avance', label: 'Avances' },
  ].map(({ value, label }) => (
    <button
      key={value}
      className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
        tipoFilter === value
          ? 'border-accent bg-accent/10 text-txt-primary'
          : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
      }`}
      onClick={() => setTipoFilter(value)}
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Aplicar el filtro y actualizar el render de cards**

Reemplazar el bloque de render de la lista (actualmente empieza con `[...db.sesiones].filter(s => isVisible(...)).reverse().map(...)`):

```jsx
{[...db.sesiones]
  .filter(s => isVisible(s, isDM, currentPlayer))
  .filter(s => tipoFilter === 'todos' || (s.tipo ?? 'sesion') === tipoFilter)
  .reverse()
  .map(s => {
    const isAvance = s.tipo === 'avance'
    const isPlanned = !isAvance && !s.logros?.trim()
    return (
      <div
        key={s.id}
        className="relative mb-5 cursor-pointer flex gap-3"
        onClick={() => setSelectedId(s.id)}
      >
        <div className={`absolute left-[-21px] top-[5px] w-2.5 h-2.5 border-2 border-bg-mid ${
          isAvance
            ? 'bg-accent/40 border-accent-dim rotate-45'
            : isPlanned ? 'bg-transparent border-txt-muted' : 'bg-border-light'
        }`} />
        <div className="w-32 shrink-0 self-stretch min-h-[64px] bg-bg-mid overflow-hidden">
          {s.imagen_url && (
            <img
              src={s.imagen_url}
              alt={s.titulo || ''}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={e => e.target.style.display = 'none'}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-exo text-[10px] font-medium text-txt-muted mb-1.5 tracking-[0.1em] uppercase">
            {isAvance ? 'Avance' : `Sesión ${s.numero}`}
            {s.fecha && ` · ${s.fecha}`}
            {s.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
            {s.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
          </div>
          <div className={`font-exo text-[12px] font-semibold tracking-[0.04em] mb-1 uppercase ${
            isAvance ? 'text-accent-dim italic' : isPlanned ? 'text-txt-secondary' : 'text-txt-primary'
          }`}>
            {s.titulo || 'Sin título'}
          </div>
          <div className="text-[13px] text-txt-secondary leading-relaxed">
            {(() => {
              const t = plainText(isAvance ? s.texto : s.resumen)
              return t.length > 180 ? t.substring(0, 180) + '…' : t
            })()}
          </div>
        </div>
      </div>
    )
  })
}
```

El marcador de avances usa `rotate-45` para formar un rombo. El título de avances es itálico con color `accent-dim`.

- [ ] **Step 3: Verificar visualmente**

```bash
npm run dev
```

- En la lista de sesiones deben verse las tres tabs.
- Las sesiones existentes siguen con el marcador cuadrado.
- Crear un avance de prueba vía "+ Nuevo Avance" (se agrega en Task 7) — por ahora verificar solo que los tabs funcionan y la lista filtra correctamente.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Sesiones.jsx
git commit -m "feat: filter tabs Todos/Sesiones/Avances y distincion visual de avances en lista"
```

---

## Task 7: Sesiones.jsx — detalle de avance, prev/next, botón Nuevo Avance

**Files:**
- Modify: `src/pages/Sesiones.jsx`

- [ ] **Step 1: Actualizar las importaciones en Sesiones.jsx**

Al inicio del archivo, actualizar los imports:

```jsx
import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'
import { DateTimeFormat, isVisible, plainText } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import ImageLightbox from '../components/ImageLightbox'
import LazyImg from '../components/LazyImg'
import { Scroll } from 'lucide-react'
import { sectionTitleCls, detailTextCls, btnSecondary, dmSectionCls, dmTitleCls } from '../constants'
```

Se agrega `dmSectionCls` y `dmTitleCls` al import de constants.

- [ ] **Step 2: Reemplazar `SesionDetailInline` completo**

Reemplazar toda la función `SesionDetailInline` con esta versión que:
- Acepta `prevId`, `nextId`, `onNavigate` como props
- Rama por `sesion.tipo`
- Botones prev/next en la barra sticky
- Editar llama `openForm('avances', id)` para avances

```jsx
function SesionDetailInline({ sesion, onBack, prevId, nextId, onNavigate }) {
  const { openForm, isDM } = useApp()
  const isAvance = sesion.tipo === 'avance'
  const isPlanned = !isAvance && !sesion.logros?.trim()
  const [lightbox, setLightbox] = useState(false)
  const backBarRef = useRef(null)
  const nameRef = useRef(null)
  const [showNameInHeader, setShowNameInHeader] = useState(false)
  const HEADER_H = 60
  useEffect(() => {
    if (!nameRef.current) return
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const observer = new IntersectionObserver(
      ([entry]) => setShowNameInHeader(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${HEADER_H + backBarH}px 0px 0px 0px` }
    )
    observer.observe(nameRef.current)
    return () => observer.disconnect()
  }, [])
  const icon = <Scroll size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <div ref={backBarRef} className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{sesion.titulo || 'Sin título'}
        </span>
        <div className="flex items-center gap-2">
          {isDM && (
            <>
              <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${sesion.id}${COLLECTION_LETTER['sesiones']}}`}</span>
              <button className={btnSecondary} onClick={() => openForm(isAvance ? 'avances' : 'sesiones', sesion.id)}>Editar</button>
            </>
          )}
          {prevId !== null && <button className={btnSecondary} onClick={() => onNavigate(prevId)}>← Ant</button>}
          {nextId !== null && <button className={btnSecondary} onClick={() => onNavigate(nextId)}>Sig →</button>}
        </div>
      </div>

      {/* Encabezado común */}
      <div className="flex w-full gap-4 max-sm:flex-col">
        <div className='flex-1 flex flex-col gap-2 h-fit'>
          <div className="pb-4 border-b border-border-base">
            <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
              {isAvance ? 'Avance' : `Sesión ${sesion.numero}`}
              {sesion.fecha && <> · {sesion.fecha}</>}
              {!isAvance && isPlanned && (
                <span className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted border border-border-light px-2 py-0.5 ml-2.5 align-middle">
                  Planificada
                </span>
              )}
              {sesion.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
              {sesion.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
            </div>
            <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
              {sesion.titulo || 'Sin título'}
            </div>
          </div>
          <div>
            <div className={'text-txt-muted text-xs flex flex-wrap max-sm:flex-col'}>
              <div className="flex items-center gap-1"><span className="font-bold text-txt-secondary">Creado:</span> <span className="whitespace-nowrap">{DateTimeFormat(sesion.createdAt)}</span></div>
              <span className="mx-4 text-accent-dim max-sm:hidden">♦</span>
              <div className="flex items-center gap-1"><span className="font-bold text-txt-secondary">Última modificación:</span> <span className="whitespace-nowrap">{DateTimeFormat(sesion.updatedAt)}</span></div>
            </div>
          </div>
        </div>
        {sesion.imagen_url && (
          <LazyImg
            src={sesion.imagen_url}
            alt={sesion.titulo || ''}
            className="max-w-full max-h-[120px] rounded-lg object-cover border border-border-base cursor-zoom-in"
            containerCls="my-1 shrink-0 max-w-[200px] h-[120px] flex items-center justify-center"
            onClick={() => setLightbox(true)}
          />
        )}
        {lightbox && <ImageLightbox src={sesion.imagen_url} alt={sesion.titulo || ''} onClose={() => setLightbox(false)} />}
      </div>

      {/* Contenido según tipo */}
      {isAvance ? (
        <>
          {sesion.texto && (
            <div className="mb-7 pb-6 border-b border-border-base mt-6">
              <div className={sectionTitleCls}>Contenido</div>
              <div className={detailTextCls}><WikiText text={sesion.texto} /></div>
            </div>
          )}
          {isDM && sesion.notas && (
            <div className={`mb-7 pb-6 ${dmSectionCls}`}>
              <div className={dmTitleCls}>Notas del DM</div>
              <div className={detailTextCls}><WikiText text={sesion.notas} /></div>
            </div>
          )}
        </>
      ) : (
        <>
          {sesion.resumen && (
            <div className="mb-7 pb-6 border-b border-border-base">
              <div className={sectionTitleCls}>Resumen</div>
              <div className={detailTextCls}><WikiText text={sesion.resumen} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
            {sesion.logros && (
              <div className="mb-7 pb-6">
                <div className={sectionTitleCls}>Momentos importantes</div>
                <div className={detailTextCls}><WikiText text={sesion.logros} /></div>
              </div>
            )}
            {isDM && sesion.ganchos && (
              <div className="mb-7 pb-6">
                <div className={sectionTitleCls}>Ganchos pendientes</div>
                <div className={detailTextCls}><WikiText text={sesion.ganchos} /></div>
              </div>
            )}
          </div>
        </>
      )}
      <PlayerNotes entityType="sesiones" entityId={sesion.id} />
    </div>
  )
}
```

- [ ] **Step 3: Actualizar `Sesiones()` para calcular prevId/nextId y pasar props**

Reemplazar el bloque de `if (selectedId !== null)` en `Sesiones()`:

```jsx
if (selectedId !== null) {
  const sesion = db.sesiones.find(s => s.id === selectedId)
  if (sesion) {
    const visibleList = db.sesiones.filter(s => isVisible(s, isDM, currentPlayer))
    const idx = visibleList.findIndex(s => s.id === selectedId)
    const prevId = idx > 0 ? visibleList[idx - 1].id : null
    const nextId = idx < visibleList.length - 1 ? visibleList[idx + 1].id : null
    return (
      <SesionDetailInline
        sesion={sesion}
        onBack={() => setSelectedId(null)}
        prevId={prevId}
        nextId={nextId}
        onNavigate={id => setSelectedId(id)}
      />
    )
  }
}
```

`db.sesiones` ya viene ordenado por `orden` desde App.jsx, por lo que `visibleList` mantiene ese orden. La navegación prev/next cubre todos los tipos (ignora `tipoFilter`).

- [ ] **Step 4: Agregar el botón "+ Nuevo Avance" en el header de la página**

En `Sesiones()`, localizar el bloque `<PageHeader>`:
```jsx
<PageHeader eyebrow="Crónica" title="Sesiones">
  {isDM && (
    <button
      className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
      onClick={() => openForm('sesiones')}
    >
      + Nueva Sesión
    </button>
  )}
</PageHeader>
```

Reemplazar con:
```jsx
<PageHeader eyebrow="Crónica" title="Sesiones">
  {isDM && (
    <div className="flex gap-2">
      <button
        className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary"
        onClick={() => openForm('avances')}
      >
        + Nuevo Avance
      </button>
      <button
        className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
        onClick={() => openForm('sesiones')}
      >
        + Nueva Sesión
      </button>
    </div>
  )}
</PageHeader>
```

"Nuevo Avance" usa estilo `btnSecondary` y "Nueva Sesión" mantiene el estilo primario.

- [ ] **Step 5: Verificación integral**

```bash
npm run dev
```

Verificar en orden:
1. La sección Sesiones carga sin errores de consola.
2. "+ Nuevo Avance" abre el formulario de Avance.
3. Crear un avance con título, texto e imagen. Al guardar, aparece en la lista con el marcador rombo.
4. Hacer click en el avance: se abre el detalle con el contenido, sin campos de sesión (resumen, logros, ganchos).
5. Los botones "← Ant" y "Sig →" navegan correctamente entre artículos.
6. Las tabs "Todos / Sesiones / Avances" filtran la lista correctamente.
7. Editar una sesión existente: el dropdown "Posición" muestra el artículo previo preseleccionado; cambiar la posición y guardar reordena la lista.
8. Editar un avance: el botón "Editar" en el detalle abre el `AvanceForm` (no el `SesionForm`).

- [ ] **Step 6: Commit final**

```bash
git add src/pages/Sesiones.jsx
git commit -m "feat: detalle de avance, prev/next en sticky bar, boton Nuevo Avance"
```
