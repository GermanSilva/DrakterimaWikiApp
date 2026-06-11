# Spec: Mapas Interactivos

**Fecha:** 2026-06-11
**Rama:** mapa

---

## Objetivo

Agregar una sección de mapas interactivos a la wiki de Drakterima. El DM puede crear mapas (imagen por URL externa), colocar pins sobre ellos que linkeen a artículos de cualquier colección o a otros mapas, formando un sistema anidado navegable. Los jugadores ven los mapas con el mismo sistema de visibilidad `publicado / secreto / borrador` que rige todas las entidades del app.

La base técnica (Leaflet.js) fue elegida deliberadamente para soportar mapas de combate interactivos en una fase futura (grids, tokens, fog of war).

---

## Stack técnico

- **`leaflet`** + **`react-leaflet`** — renderer de mapas con zoom/pan, CRS.Simple para imágenes no-geográficas
- CSS de Leaflet importado en `src/main.jsx`
- Los pins se renderizan como CSS DivIcons (sin imágenes externas, coherente con tema oscuro)
- No se agregan otras dependencias

---

## Modelo de datos

### Colección `mapas`

```js
{
  id: number,
  nombre: string,
  imagen_url: string,
  descripcion: string,
  notas: string,           // solo visible para DM
  is_default: boolean,     // el mapa que abre la sección por defecto
  estado: 'publicado' | 'secreto' | 'borrador',
  visibilidad: number[],   // PJ ids (aplica cuando estado === 'secreto')
}
```

### Colección `map_points`

```js
{
  id: number,
  map_id: number,          // id del mapa al que pertenece el punto
  nombre: string,
  descripcion: string,
  x: number,               // 0.0–1.0, porcentaje del ancho (0 = izquierda)
  y: number,               // 0.0–1.0, porcentaje del alto (0 = arriba)
  link_type: 'lugar' | 'pnj' | 'faccion' | 'lore' | 'item' | 'sesion' | 'mapa' | null,
  link_id: number | null,  // id de la entidad o mapa linkeado
  estado: 'publicado' | 'secreto' | 'borrador',
  visibilidad: number[],
}
```

Las coordenadas `x/y` son normalizadas (0–1) e independientes de las dimensiones reales de la imagen. La conversión al sistema de Leaflet ocurre en el componente viewer:

```js
// Leaflet CRS.Simple invierte el eje Y (0 = abajo en latLng)
// Usamos bounds fijos [[0,0],[1000,1000]] para el imageOverlay
// Conversión: leafletLat = (1 - y) * 1000, leafletLng = x * 1000
const toLeaflet = (x, y) => [(1 - y) * 1000, x * 1000]
const fromLeaflet = (latlng) => ({ x: latlng.lng / 1000, y: 1 - latlng.lat / 1000 })
```

---

## Navegación y UI

### Entrada en sidebar

Nueva entrada `mapas` en `NAV` de `Sidebar.jsx`, con ícono `Map` de lucide-react.

### Vista por defecto (`Mapas.jsx`)

- Si existe un mapa con `is_default: true` → lo abre directamente en el viewer
- Si no → muestra un grid de tarjetas de mapas (nombre + imagen)
- El DM ve todos los mapas (incluye borrador/secreto); los jugadores ven solo los visibles

### Viewer de mapa (`MapViewer.jsx`)

- Altura fija: `calc(100vh - 60px)`, `overflow: hidden` — el scroll acciona el zoom de Leaflet
- Layout: mapa ocupa todo el `main`, sidebar permanece visible (Opción A del brainstorming)

### Breadcrumb

Estado local en `Mapas.jsx`: array de `{ id, nombre }`. Al navegar a un sub-mapa se hace push; cada segmento es clickeable para volver.

```
🗺 Drakterima  →  Magral  →  Kardevir
```

Renderizado como overlay top-left sobre el mapa.

### Pins (estilo B — clásico)

- Forma teardrop/gota implementada en CSS puro como `L.divIcon`
- Color por tipo de link:
  - `lugar` → rojo `#dc2626`
  - `pnj` → verde `#22c55e`
  - `faccion` → naranja `#f59e0b`
  - `lore` → azul `#3b82f6`
  - `item` → cian `#06b6d4`
  - `sesion` → gris `#6b7280`
  - `mapa` → amarillo-oro `#eab308`
  - `null` (sin link) → blanco `#e5e7eb`
- Puntos con `estado === 'secreto'` se ven atenuados (opacity 0.4) solo para el DM; los jugadores no los ven
- Puntos con `estado === 'borrador'` solo los ve el DM, atenuados

### Popup flotante (estilo A)

Al clickear un pin, aparece un popup React (no Leaflet nativo) posicionado sobre el pin:

- Imagen de la entidad linkeada (si tiene `imagen_url`) o placeholder con ícono por tipo
- Tipo/categoría en pequeño (ej. "Ciudad · Magral")
- Nombre en negrita
- Descripción truncada a 2 líneas
- Botón primario:
  - Si `link_type !== 'mapa'` → **"Ver artículo"** → `goToDetail(page, link_id)`
  - Si `link_type === 'mapa'` → **"Abrir mapa"** → navega al sub-mapa (push al breadcrumb)
- Botón secundario (solo DM): **"Editar punto"** → abre `FormModal` del punto
- Botón cerrar (✕)

### Toolbar DM

Overlay bottom-center sobre el mapa, visible solo cuando `isDM`:

```
[ + Agregar punto ]  [ ⚙ Editar mapa ]
```

**Modo agregar punto:**
- Se activa al clickear "+ Agregar punto" (el botón queda activo/highlighted)
- El cursor cambia a crosshair sobre el mapa
- Click en el mapa → aparece un pin fantasma (semi-transparente, draggable) en la posición clickeada
- Mientras el pin fantasma está activo, aparece un mini-toolbar: **"Confirmar"** y **"Cancelar"**
- El DM puede arrastrar el pin fantasma para reposicionarlo antes de confirmar
- **Confirmar** → toma la posición final del pin, abre `FormModal` con `x/y` precargados y `map_id`
- **Cancelar** → elimina el pin fantasma, permanece en modo agregar punto
- Al guardar/cancelar el formulario, el modo agregar punto se desactiva
- El pin fantasma se implementa como `L.marker([lat, lng], { draggable: true })` con un DivIcon distinto (borde punteado, menor opacidad)

**Editar mapa:** abre `FormModal` del mapa actual.

---

## Formularios

### `MapaForm.jsx`

Campos: `nombre` (required), `imagen_url`, `descripcion` (textarea), `notas` (textarea, DM only), `is_default` (checkbox), `EstadoField`.

### `MapPointForm.jsx`

Campos: `nombre` (required), `descripcion` (textarea), `link_type` (select: "Sin link" + los 7 tipos), `link_id` (select dinámico según `link_type`, lista de entidades de esa colección), `EstadoField`.

Los campos `x/y` no son editables en el formulario — se setean por click en el mapa y se muestran como info de solo lectura.

---

## Integración con el app

Siguiendo los 10 pasos de "Agregar un nuevo tipo de entidad" del CLAUDE.md:

1. `src/pages/Mapas.jsx` — patrón detalle inline con `selectedId` (id del mapa activo)
2. `FORM_COMPONENTS` en `FormModal.jsx` — entradas para `'mapas'` y `'map_points'`
3. `NAV` en `Sidebar.jsx` — entrada `mapas`
4. `PAGES` en `App.jsx` — entrada `mapas: Mapas`
5. `seed.js` — `mapas: []` y `map_points: []` en `defaultData`
6. `App.jsx` — `seedCollectionIfEmpty('mapas', [])` y `seedCollectionIfEmpty('map_points', [])`
7. Listado filtrado con `isVisible(mapa, isDM, currentPlayer)`
8. `WikiText` no aplica al viewer de mapa (los campos descripcion/notas del formulario sí usan textarea estándar)
9. `wikiHelpers.js` — agregar `mapas → 'M'` a `COLLECTION_LETTER` (así otros artículos pueden linkear mapas con `[[{1M}Mapa del Mundo]]`)
10. Sticky name-in-header no aplica (el viewer no usa detalle inline estándar)

`map_points` **no** se agrega a `COLLECTION_LETTER` — los puntos no son enlazables individualmente desde WikiText.

`COLLECTIONS` en `App.jsx` se extiende con `'mapas'` y `'map_points'`.

Las mutaciones de `map_points` pasan por `save('map_points', data)` y `remove('map_points', id)` — sin funciones especiales nuevas en `App.jsx`.

---

## Scope de implementación

El plan de implementación se divide en dos fases. **Cada fase termina con el app funcionando** — no hay estados intermedios rotos.

### Fase 1 — Infraestructura + viewer + editing DM básico

- Instalar `leaflet` y `react-leaflet`
- Agregar colecciones `mapas` / `map_points` a Firestore (seed, COLLECTIONS, App.jsx)
- Crear `MapaForm.jsx` y `MapPointForm.jsx` (sin `EstadoField` aún — solo campos básicos)
- Crear `MapViewer.jsx` con Leaflet (imageOverlay, zoom/pan, pins, popup)
- Click-to-place: toolbar DM, modo agregar punto, cursor crosshair, coordenadas desde Leaflet click event (`useMapEvents`)
- Crear `Mapas.jsx` (lista de mapas + viewer + breadcrumb)
- Wiring en sidebar, App.jsx, FormModal
- `wikiHelpers.js`: letra `'M'` para mapas

**Resultado:** DM puede crear mapas, colocar puntos haciendo click en el mapa, ver el mapa con pins, navegar entre mapas vinculados. Los jugadores ven los mapas publicados (todos los puntos visibles por defecto en Fase 1).

### Fase 2 — Visibilidad + pulido

- `EstadoField` en ambos formularios (mapas y map_points)
- Visibilidad de puntos en el viewer (secreto/borrador atenuados o ocultos según rol)
- `is_default` en `MapaForm.jsx` y lógica en `Mapas.jsx`
- Botón "Editar punto" en popup (solo DM)

**Resultado:** feature completa con visibilidad granular, lista para fase futura de mapas de combate.

---

## Fuera de scope (Fase 3 — Mapas de combate)

- Grid de combate superpuesto
- Tokens arrastrables con imagen
- Fog of war (polígonos)
- Herramientas de dibujo (líneas, áreas de efecto)
- Medición de distancias en pantalla

La base Leaflet instalada en Fase 1 soporta todo esto sin reescribir nada.

---

## Cómo retomar en una sesión nueva

El plan de implementación está en `docs/superpowers/plans/2026-06-11-mapas-interactivos.md`.

Para ejecutar en una sesión nueva:
1. Leer el plan
2. Invocar `superpowers:subagent-driven-development`
3. Los subagentes tienen todos los permisos de lectura aprobados; los de escritura requieren confirmación del usuario
