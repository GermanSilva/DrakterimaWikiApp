# Wiki del DM — Dragones Revelados
## Guía de mejoras para Claude Code

Este documento describe la arquitectura del proyecto, los bugs conocidos y las mejoras
pendientes para que Claude Code pueda trabajar directamente sobre el proyecto.

---

## Arquitectura del proyecto

Aplicación React + Vite de una sola página (SPA). Sin backend ni base de datos.
Entorno: Node/npm, dev server en `localhost:5173`. Comandos: `npm run dev` · `npm run build`.

**Persistencia:**
Todo el estado vive en `localStorage` bajo la clave `drakterima_wiki_v1`. La estructura
es un objeto con siete colecciones: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`,
`lore`, `items`. Cada ítem tiene un `id` numérico único asignado por `nextId()` en
`src/helpers.js`. Las escrituras se hacen exclusivamente a través de `save(type, data)` y
`remove(type, id)` en `App.jsx`, que actualizan React state y localStorage de forma atómica.

**Flujo de render:**
`App.jsx` contiene todo el estado global (`db`, `page`, `detail`, `form`, `toastMsg`).
Lo distribuye por `AppContext` (ver `src/AppContext.jsx`). Los componentes consumen el
contexto con `useApp()`. No hay librería de estado externa. Los overlays (`DetailPanel`,
`FormModal`) se montan condicionalmente desde `App.jsx` cuando `detail` o `form` no son
`null`.

**Patrones establecidos:**
- Cada tipo de entidad tiene una vista en `DETAIL_VIEWS` (DetailPanel.jsx) y un formulario
  en `FORM_COMPONENTS` (FormModal.jsx). Agregar una entidad nueva requiere tocar ambos
  mapas, agregar una página en `src/pages/`, un nav-item en `Sidebar.jsx` y una entrada
  en el mapa `PAGES` de `App.jsx`.
- CSS: todas las variables de color están en `:root` de `src/styles.css`. No hardcodear
  colores. Fuentes actuales: Barlow (body), Exo 2 (labels/nav/títulos).
- Campos privados del DM (`notas`, `secreto`) se muestran con `var(--accent)` /
  `var(--accent-bright)` en el detail panel como convención visual (sin auth).
- `nl2br(text)` en `src/helpers.js` convierte `\n` a `<br>` para `dangerouslySetInnerHTML`.

---

## Bugs conocidos (prioridad alta)

### ~~BUG 1 — Inconsistencia de campos en Ítems~~ ✅ RESUELTO
Resuelto en la migración a React. `FormModal` y `DetailPanel` usan el mismo schema:
`{ nombre, tipo, rareza, requiere_sintonia, descripcion, lore, poseedor }`.

### ~~BUG 2 — `deleteItem` sin toast~~ ✅ RESUELTO
Resuelto en la migración a React. `remove()` en `App.jsx` llama `showToast('Eliminado')`
para todos los tipos.

### BUG 3 — Tecla Escape no cierra paneles
Los overlays de detalle y formulario no responden a `Escape`.

**Fix:** Agregar `useEffect` en `App.jsx` que escucha `keydown`:
```jsx
// En App.jsx, importar useEffect, luego dentro del componente App:
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
Prioridad: cierra el form primero si ambos estuviesen abiertos (no ocurre en la UI actual,
pero es el orden correcto por capas de modal).

---

## Mejoras funcionales (prioridad media)

### MEJORA 1 — Búsqueda en vivo en PJs y PNJs
Ninguna de las dos páginas tiene búsqueda. El componente `FilterPills` (ya en Shared.jsx)
puede reutilizarse para filtros por relación en PNJs; para texto libre se necesita un
`<input>` adicional.

**PJs (`src/pages/PJs.jsx`):** Agregar `useState` para query de texto. Filtrar
`db.pjs` por `nombre`, `clase`, `raza` y `jugador` antes de renderizar.

**PNJs (`src/pages/PNJs.jsx`):** Ya tiene filtro por relación. Agregar búsqueda de texto
sobre `nombre`, `rol` y `faccion`. La búsqueda de texto y el filtro de relación deben
combinarse (AND).

### MEJORA 2 — Dashboard más rico
El dashboard ya tiene el bloque de conflicto central y la última sesión.
Falta agregar:
- **"Próxima sesión"**: sesión donde `logros` está vacío → mostrar título y ganchos.
  Lógica: `db.sesiones.find(s => !s.logros?.trim())` (la primera sin logros).
- **"PNJs recientes"**: los últimos 3 PNJs según orden en el array (`db.pnjs.slice(-3).reverse()`).
  Mostrar como mini-cards con nombre, rol y tag de relación.

### MEJORA 3 — Badge de "sesión planificada" vs "jugada"
En la timeline de Sesiones, distinguir visualmente:
- Sesión jugada: `s.logros` tiene contenido → `.timeline-dot` normal (dorado/rojo).
- Sesión planificada: `s.logros` vacío → añadir clase `planned` al `.timeline-item`.

**CSS a agregar en `src/styles.css`** (cerca de las reglas `.timeline-dot`):
```css
.timeline-item.planned .timeline-dot {
  background: transparent;
  border-color: var(--text-muted);
}
.timeline-item.planned .timeline-title { color: var(--text-secondary); }
```

### MEJORA 4 — Campo "jugador" en cards de PJs
En `src/pages/PJs.jsx`, el card footer muestra `?` cuando `jugador` está vacío.
Cambiar a `Sin asignar` con color `var(--text-muted)`.

```jsx
// Cambiar:
<span className="card-meta">Nv. {p.nivel || 1} · {p.jugador || '?'}</span>
// Por:
<span className="card-meta">
  Nv. {p.nivel || 1} ·{' '}
  {p.jugador || <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>}
</span>
```

### MEJORA 5 — Confirmación al cerrar formulario con cambios
En `FormModal.jsx`, el click en el overlay (`#form-overlay`) cierra el form sin avisar si
hay datos escritos. Los formularios locales de cada `*Form` usan estado `f` inicializado
desde `item`. La verificación más pragmática es hacerla en el overlay del modal:

```jsx
// En FormModal, reemplazar el onClick del overlay:
onClick={e => {
  if (e.target.id !== 'form-overlay') return
  const inputs = e.currentTarget.querySelectorAll('input, textarea, select')
  const hasData = [...inputs].some(el => el.value.trim())
  if (!hasData || confirm('¿Descartar cambios?')) closeForm()
}}
```
Nota: esto detecta cualquier campo no vacío, incluyendo los precargados al editar un ítem
existente. Para edición, el confirm siempre aparecerá. Es el tradeoff aceptable sin
refactoring mayor.

---

## Mejoras de UI (prioridad baja)

### UI 1 — Sidebar colapsable en pantalla reducida
En mobile (`≤768px`), el sidebar empuja el contenido. Implementar toggle con botón `☰`
en el header que añade/quita clase `.sidebar-open` al `#layout`.

**Header.jsx:** Agregar botón hamburguer (visible solo en mobile vía CSS) que llama a
una función pasada como prop o mediante un estado global en contexto.
**App.jsx:** Agregar `sidebarOpen` state. Pasarlo al header y al layout.
**styles.css:**
```css
@media (max-width: 768px) {
  #sidebar { transform: translateX(-100%); transition: transform 0.25s; }
  #layout.sidebar-open #sidebar { transform: translateX(0); }
  #main { margin-left: 0; }
}
```

### UI 2 — Animación de entrada para cards
Las cards aparecen sin transición al navegar.
```css
@keyframes cardIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card { animation: cardIn 0.2s ease both; }
.cards-grid .card:nth-child(1) { animation-delay: 0.02s; }
.cards-grid .card:nth-child(2) { animation-delay: 0.04s; }
.cards-grid .card:nth-child(3) { animation-delay: 0.06s; }
.cards-grid .card:nth-child(4) { animation-delay: 0.08s; }
.cards-grid .card:nth-child(5) { animation-delay: 0.10s; }
.cards-grid .card:nth-child(6) { animation-delay: 0.12s; }
```

### UI 3 — Indicador de secreto DM en cards
Los PNJs con `secreto` y PJs con `notas` no tienen indicación visual en la card.
Agregar un `🔒` pequeño en el `card-header` de `PJs.jsx` y `PNJs.jsx`:

```jsx
// En el card-header, junto al card-icon:
{p.notas && <span style={{ fontSize: 10, opacity: 0.4 }} title="Tiene notas DM">🔒</span>}
// Para PNJs:
{p.secreto && <span style={{ fontSize: 10, opacity: 0.4 }} title="Tiene secreto DM">🔒</span>}
```

### UI 4 — Mejorar el detail panel de sesión
El resumen se muestra como texto plano. Las líneas que empiezan con número + punto
(`1.`, `2.`, etc.) son escenas y se benefician de separación visual.

En `DetailPanel.jsx`, función `SesionDetail`, renderizar el resumen con lógica:
```jsx
function renderResumen(text) {
  if (!text) return null
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (/^\d+\./.test(line.trim())) {
      return <div key={i} className="scene-item">{line}</div>
    }
    return <span key={i}>{line}<br /></span>
  })
}
```
CSS en `styles.css`:
```css
.scene-item {
  padding: 6px 0 6px 14px;
  border-left: 2px solid var(--border);
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--text-secondary);
}
.scene-item:hover { border-left-color: var(--accent-dim); }
```

### UI 5 — Color de acento por región en detail panel
El `detail-eyebrow` usa siempre `var(--text-muted)`. Si la entidad tiene `region`,
aplicar el color del tag de región como acento sutil en el eyebrow.

En `DetailPanel.jsx`, agregar helper y usarlo en los detail views que tienen región:
```jsx
const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}
// En el JSX del eyebrow:
<div className="detail-eyebrow" style={{ color: REGION_COLOR[item.region] || undefined }}>
```

---

## Consideraciones al editar

- **Estructura:** Proyecto React + Vite multi-archivo. No concentrar lógica en un solo
  archivo. Seguir los patrones establecidos (ver sección Arquitectura arriba).
- **localStorage key:** `drakterima_wiki_v1`. Cambios breaking al schema de datos
  requieren incrementar la versión (`v2`) y agregar migración en `loadData()` de `App.jsx`.
- **Variables CSS:** Usar exclusivamente las variables de `:root` en `src/styles.css`.
  No hardcodear colores.
- **Fuentes:** Barlow (body), Exo 2 (labels/nav). No agregar otras fuentes.
- **Sesiones: ordenamiento:** `save('sesiones', ...)` en `App.jsx` ordena el array por
  `numero` automáticamente tras cada guardado.
- **No hay test runner configurado.** Verificar cambios ejecutando `npm run dev` y
  probando manualmente en el navegador.

---

## Estado actual de datos (seed)

Al abrir por primera vez (localStorage vacío), se cargan:

| Entidad | Cantidad | Contenido |
|---|---|---|
| Sesiones | 1 | "El Escuadrón Incompleto" — plan completo con secretos DM |
| PJs | 6 | Maisie, Eldric, Kaylinx, Alyssara, Kaelen, Varana |
| PNJs | 2 | Maelis Dornavar, Sargento Varnek |
| Lugares | 4 | Kardevir, Genesia, Jakal, Biram |
| Facciones | 5 | Orden de Argan, Legión Magral, Culto de Ragon, Gremio, Islas Pétreas |
| Lore | 3 | La Guerra de los Dragones, La Magralita, Drakterima el Continente |
| Ítems | 0 | — |
