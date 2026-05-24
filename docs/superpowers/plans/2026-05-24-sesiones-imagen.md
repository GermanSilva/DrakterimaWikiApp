# Sesiones — Imagen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar soporte de `imagen_url` a las sesiones: campo en el formulario, imagen en la vista de detalle (a la derecha del título), y thumbnail en la lista de sesiones (a la izquierda de cada item).

**Architecture:** Se siguen los patrones ya establecidos en el codebase — el campo `imagen_url` existe en PNJs, Lugares, Facciones e Ítems. Los cambios tocan únicamente `FormModal.jsx` (agregar el campo al form de sesiones) y `Sesiones.jsx` (detalle + lista). No se requiere cambio en `seed.js`, Firestore, ni ningún otro archivo.

**Tech Stack:** React 18, Tailwind CSS (clases utilitarias), Firestore (sin cambio de esquema — el campo es opcional).

---

## File Map

| Archivo | Cambio |
|---|---|
| `src/components/FormModal.jsx` | `SesionForm`: agregar `imagen_url` al estado y renderizar input URL + preview |
| `src/pages/Sesiones.jsx` | `SesionDetailInline`: mostrar imagen a la derecha del encabezado |
| `src/pages/Sesiones.jsx` | Lista de sesiones: agregar thumbnail a la izquierda de cada item |

---

### Task 1: Agregar `imagen_url` al formulario de sesiones

**Files:**
- Modify: `src/components/FormModal.jsx` — función `SesionForm` (líneas 62–115)

- [ ] **Step 1: Agregar `imagen_url` al estado inicial de `SesionForm`**

En `src/components/FormModal.jsx`, localizar la función `SesionForm`. El `useState` inicial (línea ~64) actualmente es:

```js
const [f, setF] = useState({
  numero: item?.numero ?? (db.sesiones.length + 1),
  fecha: item?.fecha ?? '',
  titulo: item?.titulo ?? '',
  resumen: item?.resumen ?? '',
  logros: item?.logros ?? '',
  ganchos: item?.ganchos ?? '',
  estado: item?.estado ?? 'publicado',
  visibilidad: item?.visibilidad ?? [],
})
```

Reemplazar por:

```js
const [f, setF] = useState({
  numero: item?.numero ?? (db.sesiones.length + 1),
  fecha: item?.fecha ?? '',
  titulo: item?.titulo ?? '',
  resumen: item?.resumen ?? '',
  logros: item?.logros ?? '',
  ganchos: item?.ganchos ?? '',
  imagen_url: item?.imagen_url ?? '',
  estado: item?.estado ?? 'publicado',
  visibilidad: item?.visibilidad ?? [],
})
```

- [ ] **Step 2: Agregar el campo de imagen al formulario**

Justo antes del `<EstadoField .../>` (línea ~107), agregar:

```jsx
<FormGroup>
  <label className={labelCls}>Imagen (URL externa)</label>
  <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
  {f.imagen_url && (
    <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
  )}
</FormGroup>
```

- [ ] **Step 3: Verificar que `imagen_url` se pasa a `save()`**

En el botón Guardar (línea ~111), el objeto ya usa spread `{ ...f, id: item?.id, ... }`, por lo que `imagen_url` se incluye automáticamente. No se requiere cambio adicional.

- [ ] **Step 4: Commit**

```bash
git add src/components/FormModal.jsx
git commit -m "feat: add imagen_url field to SesionForm"
```

---

### Task 2: Mostrar imagen en la vista de detalle de sesión

**Files:**
- Modify: `src/pages/Sesiones.jsx` — función `SesionDetailInline` (líneas 27–84)

- [ ] **Step 1: Envolver el encabezado en un flex row con la imagen a la derecha**

Localizar el bloque del encabezado en `SesionDetailInline` (líneas ~43–58):

```jsx
<div className="mb-8 pb-5 border-b border-border-base">
  <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
    Sesión {sesion.numero}
    {sesion.fecha && <> · {sesion.fecha}</>}
    {isPlanned && (
      <span className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted border border-border-light px-2 py-0.5 ml-2.5 align-middle">
        Planificada
      </span>
    )}
    {sesion.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
    {sesion.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
  </div>
  <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
    {sesion.titulo || 'Sin título'}
  </div>
</div>
```

Reemplazar por:

```jsx
<div className="mb-8 pb-5 border-b border-border-base flex w-full gap-4">
  <div className="flex-1">
    <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
      Sesión {sesion.numero}
      {sesion.fecha && <> · {sesion.fecha}</>}
      {isPlanned && (
        <span className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted border border-border-light px-2 py-0.5 ml-2.5 align-middle">
          Planificada
        </span>
      )}
      {sesion.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
      {sesion.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
    </div>
    <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
      {sesion.titulo || 'Sin título'}
    </div>
  </div>
  {sesion.imagen_url && (
    <div className="my-1">
      <img
        src={sesion.imagen_url}
        alt={sesion.titulo}
        className="max-w-full max-h-[120px] rounded-lg object-cover border border-border-base"
        onError={e => e.target.style.display = 'none'}
      />
    </div>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Sesiones.jsx
git commit -m "feat: show imagen_url in SesionDetailInline header"
```

---

### Task 3: Mostrar thumbnail en la lista de sesiones

**Files:**
- Modify: `src/pages/Sesiones.jsx` — map de sesiones en el listado (líneas ~118–140)

- [ ] **Step 1: Envolver el contenido del item en un flex row con thumbnail a la izquierda**

Localizar el `<div>` interno de cada item del mapa (el `div` que contiene el dot + el contenido textual, líneas ~122–139):

```jsx
<div
  key={s.id}
  className="relative mb-5 cursor-pointer"
  onClick={() => setSelectedId(s.id)}
>
  <div className={`absolute left-[-21px] top-[5px] w-2.5 h-2.5 border-2 border-bg-mid ${isPlanned ? 'bg-transparent border-txt-muted' : 'bg-border-light'}`} />
  <div className="font-exo text-[10px] font-medium text-txt-muted mb-1.5 tracking-[0.1em] uppercase">
    Sesión {s.numero} · {s.fecha || 'Sin fecha'}
    {s.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
    {s.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
  </div>
  <div className={`font-exo text-[12px] font-semibold tracking-[0.04em] mb-1 uppercase ${isPlanned ? 'text-txt-secondary' : 'text-txt-primary'}`}>
    {s.titulo || 'Sin título'}
  </div>
  <div className="text-[13px] text-txt-secondary leading-relaxed">
    {(s.resumen || '').substring(0, 180)}{(s.resumen || '').length > 180 ? '...' : ''}
  </div>
</div>
```

Reemplazar por:

```jsx
<div
  key={s.id}
  className="relative mb-5 cursor-pointer flex gap-3"
  onClick={() => setSelectedId(s.id)}
>
  <div className={`absolute left-[-21px] top-[5px] w-2.5 h-2.5 border-2 border-bg-mid ${isPlanned ? 'bg-transparent border-txt-muted' : 'bg-border-light'}`} />
  <div className="w-32 shrink-0 self-stretch bg-bg-mid overflow-hidden">
    {s.imagen_url && (
      <img
        src={s.imagen_url}
        alt={s.titulo}
        className="w-full h-full object-cover"
        onError={e => e.target.style.display = 'none'}
      />
    )}
  </div>
  <div className="flex-1 min-w-0">
    <div className="font-exo text-[10px] font-medium text-txt-muted mb-1.5 tracking-[0.1em] uppercase">
      Sesión {s.numero} · {s.fecha || 'Sin fecha'}
      {s.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
      {s.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
    </div>
    <div className={`font-exo text-[12px] font-semibold tracking-[0.04em] mb-1 uppercase ${isPlanned ? 'text-txt-secondary' : 'text-txt-primary'}`}>
      {s.titulo || 'Sin título'}
    </div>
    <div className="text-[13px] text-txt-secondary leading-relaxed">
      {(s.resumen || '').substring(0, 180)}{(s.resumen || '').length > 180 ? '...' : ''}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Sesiones.jsx
git commit -m "feat: add thumbnail to session list items"
```
