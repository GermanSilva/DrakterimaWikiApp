# CLAUDE.md

Este archivo provee orientación a Claude Code (claude.ai/code) cuando trabaja en este repositorio.

## Preferencias de workflow (superpowers)

> **IMPORTANTE — estas reglas sobreescriben el comportamiento por defecto de cualquier skill de superpowers, incluyendo brainstorming, writing-plans y subagent-driven-development. No preguntar, no ofrecer alternativas, aplicar directamente.**

Cuando se usa el flujo brainstorming → writing-plans → ejecución de superpowers:

- **Commits intermedios + squash final**: cada tarea de implementación hace su propio commit (facilita code reviews con `git diff`). Al terminar todas las tareas, hacer `git reset --soft <base-sha>` para colapsar todos los commits en uno solo, luego el commit final único. El spec y el plan se incluyen en ese commit final.
- **Auto-aprobar specs**: no pedir al usuario que revise el spec escrito; pasar directamente a writing-plans sin esperar confirmación.
- **Siempre subagentes**: al terminar writing-plans, invocar directamente `superpowers:subagent-driven-development` sin ofrecer opciones. No preguntar "¿cuál preferís?".
- **Permisos auto-aprobados**: los subagentes tienen todos los permisos aprobados automáticamente. Los permisos de lectura están aprobados. Los permisos de comandos Bash de comprobación o búsqueda de archivos o código también están aprobados. Los permisos de escritura y ejecución de comandos que introducen cambios solo pueden ser dados por el usuario. En caso de duda consultar con el usuario. No asumir nada.
- **Finalización**: Siempre terminar la implementación manteniendo la rama como está, sin ofrecer opciones alternativas de finalización.

## Comandos

```bash
npm run dev       # Servidor de desarrollo (Vite, localhost:5173)
npm run build     # Build de producción (salida en dist/)
npm run preview   # Vista previa del build de producción
```

No hay test runner configurado.

El proyecto está deployado en GitHub Pages: `https://germansilva.github.io/DrakterimaWikiApp/`
El deploy se dispara automáticamente al pushear a `main` vía `.github/workflows/deploy.yml`.

## Principios de diseño

- **Clean architecture**: cada componente o módulo tiene una única responsabilidad. Preferir componentes pequeños y bien delimitados sobre componentes grandes que hacen múltiples cosas. Las fronteras entre capas deben ser claras: parseo, presentación, estado y datos no deben mezclarse en un mismo componente.
- **YAGNI**: no agregar abstracciones ni features especulativos. Solo construir lo que el requerimiento actual necesita.
- **Sin efectos colaterales ocultos**: las mutaciones de datos pasan exclusivamente por `save`, `remove` y `savePlayerNote` en `App.jsx`.

## Arquitectura

**dragones-wiki** es una SPA (Single Page Application) para gestionar la campaña de D&D "Leyendas de Drakterima". Stack: React 18 + Vite 5, sin backend propio.

### Fuente de verdad y sincronización

Los datos viven en **Firebase Firestore**. La app usa `onSnapshot` para sincronización en tiempo real entre múltiples pestañas/usuarios sin necesidad de recargar.

- **`src/firebase.js`**: inicializa Firestore con las 6 vars `VITE_FIREBASE_*` y habilita persistencia offline con `enableMultiTabIndexedDbPersistence`.
- **Colecciones Firestore**: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`, `player_notes`, `login_logs`, `game_logs`, `game_pot`, `game_config`, `mapas`, `map_points`. Los documentos usan el `id` numérico convertido a string como doc ID.
- **Seed**: al primer load, `seedCollectionIfEmpty(collName, seedData)` comprueba si la colección está vacía y la rellena con datos iniciales usando `writeBatch`.
- Sin Firebase Storage — las imágenes se referencian por URL externa (`imagen_url`, campo de texto).

### Flujo de datos

`App.jsx` es dueño de todo el estado: `db` (datos), `page` (vista activa), `detail` (panel de detalle), `form` (modal de formulario), `toastMsg`, `sidebarOpen`, `pendingDetail`. Todas las mutaciones pasan por `save(type, data)` y `remove(type, id)`, que escriben directamente a Firestore.

- `save(type, data)`: `setDoc` en Firestore con el doc id = `String(data.id ?? nextId(...))`.
- `remove(type, id)`: `deleteDoc` en Firestore.
- `savePlayerNote(pj_id, type, entity_id, text)`: `setDoc` en `player_notes` con doc id `${pj_id}_${type}_${entity_id}`.
- `importData(file)`: upsert masivo vía `writeBatch` a Firestore.
- `exportData()`: descarga el `db` completo como `drakterima-YYYY-MM-DD.json`.

`AppContext.jsx` expone el contexto; todos los componentes hijos lo consumen con `useApp()`. No se usa ninguna librería de estado externa.

- `openForm(type, id, prefill)`: el tercer argumento `prefill` (objeto opcional) se pasa al formulario como prop — usado por `MapViewer` para pre-cargar `{ map_id, x, y }` al crear un punto via click-to-place.

### Esquema de datos (`seed.js`)

El objeto `db` tiene las colecciones: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`, `player_notes`, `mapas`, `map_points`. Cada ítem tiene un `id` numérico asignado por `nextId()` (máximo id existente + 1).

- `defaultData` tiene `lugares`, `facciones` y `lore` pre-cargados.
- `seedPJs`, `seedPNJs`, `seedSesiones` se inyectan en el primer load si esas colecciones están vacías.

### Visibilidad de entidades (`estado` / `visibilidad`)

Cada entidad de las 7 colecciones principales tiene dos campos de control de acceso:

- **`estado`**: `'publicado'` | `'secreto'` | `'borrador'`. Default implícito: `'publicado'`.
- **`visibilidad`**: `number[]` — array de IDs de PJs que pueden ver la entidad cuando `estado === 'secreto'`.

La función `isVisible(entity, isDM, currentPlayer)` en `helpers.js` implementa la lógica:
- DM: siempre ve todo.
- `borrador`: solo DM.
- `publicado`: todos.
- `secreto`: DM + PJs cuyo `id` esté en `visibilidad`.

Todos los listados de páginas filtran con `isVisible`. Los componentes de formulario incluyen `EstadoField` (en `FormModal.jsx`) que muestra un select de estado y, cuando `estado === 'secreto'`, checkboxes para seleccionar PJs.

Las etiquetas CSS `tag-borrador` (dorado) y `tag-secreto` (violeta) se muestran en cards y vistas de detalle. Las entidades `publicado` no muestran etiqueta de estado.

### Layout de la UI

Tres columnas: `Header` (barra superior con logo SVG y hamburger en mobile) → `Sidebar` (nav izquierdo con contadores y botones de importar/exportar) → `main` (página activa).

El sidebar tiene menú hamburger en mobile (`sidebarOpen` / `toggleSidebar`). Al hacer click en un ítem del nav en mobile, el sidebar se cierra automáticamente.

El `<main>` no tiene padding ni max-width cuando `page === 'mapas'` — el viewer Leaflet ocupa todo el espacio disponible.

### Navegación y detalle inline

Todas las páginas de entidades usan **detalle inline** (no panel lateral): cada página tiene un estado local `selectedId` (null = lista, non-null = detalle). Al seleccionar un ítem se renderiza el componente de detalle con un botón "← Volver".

La única excepción es `items`, que todavía usa `DetailPanel` (panel slide-in derecho).

Para navegar directamente a un ítem desde otra página (ej. Dashboard → sesión específica), se usa el mecanismo `pendingDetail`:
- `goToDetail(page, id)` en el contexto: setea la página y guarda `{ id }` en `pendingDetail`.
- La página destino inicializa `selectedId` con `pendingDetail?.id ?? null` y llama `consumePendingDetail()` en un `useEffect` al montar.

### Formularios

Los formularios abren en `FormModal` (modal centrado). El título y las acciones (guardar/eliminar/cancelar) son `position: sticky` (top y bottom respectivamente), con el contenido scrolleable en el medio. Al hacer click fuera del modal, pide confirmación si hay campos con contenido.

Cada formulario incluye el componente `EstadoField` para controlar la visibilidad de la entidad.

### Constantes de estilo (`constants.js`)

`src/constants.js` exporta clases Tailwind reutilizables: `sectionTitleCls`, `detailTextCls`, `detailSectionCls`, `dmSectionCls`, `dmTitleCls`, `labelCls`, `inputCls`, `btnPrimary`, `btnDanger`, `btnSecondary`, `REGION_COLOR`. Usar en lugar de duplicar clases inline.

### Zona DM

`src/pages/ZonaDM.jsx` es una página visible solo para el DM. Contiene: exportar/importar JSON, registro de accesos de jugadores (`login_logs`), configuración y logs del sistema de juegos (`JuegosSection`), y mantenimiento (backfill de timestamps). Al agregar nuevas tareas admin, hacerlas aquí.

### Sistema de juegos (`Juegos.jsx`, `Dice3D.jsx`)

`src/pages/Juegos.jsx` — lotería d20, un tiro por día por jugador. Lee config de `game_config/loteria` (commonMinRoll, commonPrize, specialPrize en monedas cp/sp/ep/gp/pp). Guarda resultado en `game_logs` con id `{pjId}_loteria_{fecha}`. El premio del DM va al pozo (`game_pot/current`).

`src/components/Dice3D.jsx` — d20 icosaedro Three.js (dep: `three`): cámara cenital, parallax, bounce zoom, snap con resorte amortiguado. Se importa con `lazy()`. Props: `onComplete(roll)` (callback con resultado 1-20), `rolling` (bool dispara animación).

Funciones de contexto (App.jsx): `saveGameResult(actorType, pjId, roll)`, `saveGameConfig(cfg)`, `assignPotToPJ(pjId, coins)`.

`JuegosSection` en ZonaDM: configurar premios/umbral, ver/eliminar logs, gestionar el pozo, asignar monedas del pozo a un PJ.

### Imágenes

Todas las entidades que muestran imagen usan un campo `imagen_url` (texto con URL externa). Los formularios tienen un input de tipo `url` con preview en tiempo real. En las vistas de detalle se renderiza con `LazyImg` (skeleton + lazy loading); hacer click abre `ImageLightbox`.

### Edición por jugadores

Los jugadores pueden editar campos de identidad de su propio PJ. `isOwnPlayer = !isDM && currentPlayer?.id === pj.id` determina si mostrar el botón de editar.

### Autenticación

- **DM**: contraseña en `VITE_DM_PASSWORD` (GitHub Secret, bakeada en el bundle). Sesión en `sessionStorage` como `drakterima_dm = '1'`.
- **Jugadores**: contraseñas en `VITE_PLAYER_1_PASSWORD` … `VITE_PLAYER_6_PASSWORD` (GitHub Secrets). Mapeadas por id de PJ en `PLAYER_PASSWORDS` en `App.jsx`. Sesión en `sessionStorage` como `drakterima_player` (JSON `{ id, nombre }`).
- `tryAccess(password)` en el contexto: prueba primero DM, luego jugadores.
- El modal de acceso está en `Sidebar.jsx` (`AccessModal`). Se abre con el botón "Acceder" cuando no hay sesión activa.

### Campos privados DM

Varios tipos tienen campos privados (`notas`, `secreto`) visualmente diferenciados con `var(--accent)` / `var(--accent-bright)` y un ícono de candado. Solo visibles cuando `isDM === true`.

### Wiki-links entre artículos

Los campos de texto largo en vistas de detalle soportan wiki-links internos. Sintaxis:

```
[[{NL}Texto del enlace]]
```

Donde `N` es el id numérico y `L` es la letra de colección (S, P, N, G, F, L, I).
Ejemplo: `[[{3G}Magrales del este]]` navega al lugar con id 3.
Links sin letra (`[[{3}Texto]]`) se renderizan como formato inválido (sin navegación).
Las letras canónicas están en `wikiHelpers.js` → `COLLECTION_LETTER`.

`WikiText` también parsea Markdown básico:
- Bloques: `# ## ###` headings, `- *` listas sin orden, `1.` listas numeradas, `---` separador horizontal.
- Inline: `**bold**`, `*italic*`, `***bold-italic***`, `[[https://...]]` imagen inline.

- El componente `WikiText` (`src/components/WikiText.jsx`) parsea el texto y llama a `goToDetail(page, id)` al hacer click en un enlace.
- Si el artículo no existe, se muestra atenuado sin acción.
- `WikiText` reemplaza `dangerouslySetInnerHTML={nl2br(...)}` en todos los detalles de entidad. Usar `<WikiText text={campo} />` dentro de `<div className="detail-text">`.
- Los campos cortos (nombre, título, fecha) no necesitan WikiText.

### Helpers de wiki-links (`wikiHelpers.js`)

- `COLLECTION_LETTER`: map colección → letra (`pjs → 'P'`, `lugares → 'G'`, `pnjs → 'N'`, `sesiones → 'S'`, `facciones → 'F'`, `lore → 'L'`, `items → 'I'`, `mapas → 'M'`).
- `LETTER_COLLECTION`: inverso de `COLLECTION_LETTER`.
- `findEntity(db, id)`: busca entidad por id numérico en todas las colecciones.
- `COLLECTION_DISPLAY`: nombres legibles de colecciones para tooltips.

### Componentes de imagen y wiki

- `LazyImg`: imagen con lazy loading y skeleton shimmer. Prop `containerCls` debe incluir clase de altura para que el skeleton sea visible. Usar en todas las vistas de detalle.
- `WikiImage`: wrapper de `LazyImg` para imágenes inline embebidas en WikiText (`[[https://...]]`).
- `ImageLightbox`: modal fullscreen. Cerrar con Escape o click afuera. Props: `src`, `alt`, `onClose`.
- `SpellDetailModal`: modal read-only para detalle de hechizo de PJ. Cerrar con Escape o click afuera. Props: `spell` (entrada de `pj.hechizos`), `onClose`. Usa `z-[250]`. Patrón idéntico a `ImageLightbox`.
- `WikiLink`: enlace clickeable con tooltip hover (thumbnail + título). Lo usa WikiText internamente; no instanciar directamente.
- `WikiLinkPicker`: modal de búsqueda para insertar wiki-links en textareas de formularios. Integrado en `FormModal`.
- `Tooltip`: tooltip hover con skeleton de thumbnail. Props: `title`, `section`, `imagenUrl`.

### Nombre en header sticky

Todas las vistas de detalle inline muestran el nombre de la entidad en la barra "← Volver" cuando el título principal sale del viewport. Patrón:
- `nameRef` en el `<div>` del título principal.
- `backBarRef` en la barra sticky con `sticky top-[60px]`.
- `HEADER_H = 60` constante (altura del Header global).
- `IntersectionObserver` con `rootMargin: -${HEADER_H + backBarH}px 0px 0px 0px`.
- `showNameInHeader` state → `opacity: 0→1` con `transition: opacity 0.2s ease`.

### Helpers (`helpers.js`)

- `regionLabel` / `regionOptions`: valores canónicos de región (`magral`, `nezor`, `heladas`, `islas`, `otro`).
- `relacionLabel`: valores canónicos de relación (`aliado`, `neutral`, `enemigo`, `desconocido`).
- `nextId(arr)`: incrementa el máximo id.
- `nl2br(text)`: utilidad legada, ya no se usa en componentes (reemplazada por `WikiText`).
- `isVisible(entity, isDM, currentPlayer)`: determina si una entidad es visible para el usuario actual.

### Activos

- `src/svgs/dragonIcon.jsx`: componente React del logo SVG del dragón. Props: `width`, `height`, `fill` (default `currentColor`), `className`, `style`.
- `public/favicon.svg`: favicon SVG con `fill="#dc2626"` (rojo de la app).

### Estilos

Todos los estilos están en `src/styles.css`. Usa CSS custom properties (`--accent`, `--text-muted`, etc.) para el tema oscuro. Sin framework CSS ni CSS-in-JS.

### Variables de entorno requeridas (GitHub Secrets → deploy.yml)

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_DM_PASSWORD
VITE_PLAYER_1_PASSWORD … VITE_PLAYER_6_PASSWORD
```

Para desarrollo local: crear `.env.local` con los mismos valores.

### Mapas interactivos (`Mapas.jsx`, `MapViewer.jsx`, `MapPopup.jsx`)

La sección Mapas usa **Leaflet** (`leaflet` + `react-leaflet`) con `CRS.Simple` para imágenes no-geográficas. El CSS de Leaflet se importa en `src/main.jsx`.

**Colecciones:**
- `mapas`: `{ id, nombre, imagen_url, descripcion, notas, is_default, estado, visibilidad }`. El campo `is_default` indica el mapa que se abre por defecto al entrar a la sección.
- `map_points`: `{ id, map_id, nombre, descripcion, x, y, link_type, link_id, estado, visibilidad }`. Las coordenadas `x/y` son normalizadas (0.0–1.0). `link_type` puede ser `'lugar'|'pnj'|'faccion'|'lore'|'item'|'sesion'|'mapa'|null`.

**Conversión de coordenadas** (en `MapViewer.jsx`, calculada dinámicamente según aspect ratio de la imagen):
```js
const mapBounds = [[0, 0], [imgSize.h, imgSize.w]]
const toLeaflet = (x, y) => [(1 - y) * imgSize.h, x * imgSize.w]
const fromLeaflet = (latlng) => ({ x: latlng.lng / imgSize.w, y: 1 - latlng.lat / imgSize.h })
```
El `imgSize` se detecta cargando la imagen con `new window.Image()` antes de montar el `MapContainer`. Esto preserva el aspect ratio real de la imagen.

**Componentes:**
- `Mapas.jsx`: maneja el stack de navegación jerárquica (`[{ id, nombre }]`). Cuando no hay mapa activo muestra una grilla de tarjetas; cuando hay uno activo, renderiza `MapViewer` a pantalla completa (`height: calc(100vh - 60px)`).
- `MapViewer.jsx`: contiene el `MapContainer`. Los eventos del mapa van por `useMapEvents` dentro del container (no `onClick` en `MapContainer`). Gestiona el modo agregar punto, pin fantasma draggable (`draggable: true`), popup, breadcrumb y toolbar DM.
- `MapPopup.jsx`: popup React posicionado absolutamente sobre el mapa (no Leaflet nativo). Lo posiciona `MapViewer` con `e.containerPoint`.

**Pin fantasma (click-to-place):** toolbar DM → "+ Agregar punto" → cursor crosshair → click en mapa → pin fantasma semitransparente arrastrable → "Confirmar posición" llama `openForm('map_points', null, { map_id, x, y })` con las coordenadas normalizadas.

**Colores de pins por tipo:** `lugar #dc2626`, `pnj #22c55e`, `faccion #f59e0b`, `lore #3b82f6`, `item #06b6d4`, `sesion #6b7280`, `mapa #eab308`, sin link `#e5e7eb`.

**Visibilidad de puntos:** `pinOpacity(pt)` en `MapViewer` — `borrador`: DM opacity 0.4 / players no ven; `secreto`: DM opacity 0.4 / players en `visibilidad` ven opacity 1.

### Ataques en fichas de PJ (`PJAttacksSection`, `AttacksCRUD`)

Cada entrada en `pj.ataques[]`:

```js
{
  id,            // number (Date.now() al crear)
  nombre,        // string — nombre del arma
  bono_ataque,   // string libre, ej. "+5"
  dano,          // string libre, ej. "1d8+3"
  tipo_dano,     // string libre, ej. "Cortante"
  alcance,       // string libre, ej. "5 ft"
  notas,         // string libre, opcional
  precio,        // number, default 0 — precio del arma
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
  portando,      // boolean, default true — true = portando, false = guardado
}
```

El precio de las armas se incluye en el totalizador "Valor total del inventario" de `PJEquipmentSection`. Las armas no tienen campo `cantidad` — se cuentan como 1 unidad en el total.

`PJAttacksSection` agrupa las armas en dos sublistas: "Portando" y "Guardado", cada una con su subtotal de precio.

### Equipo e inventario (`PJEquipmentSection`, `EquipmentCRUD`)

Cada entrada en `pj.equipo[]`:

```js
{
  id,            // number (Date.now() al crear)
  nombre,        // string
  cantidad,      // number, default 1
  descripcion,   // string libre, opcional
  precio,        // number, default 0 — precio unitario
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
  portando,      // boolean, default true — true = portando, false = guardado
}
```

Monedas del PJ:

```js
pj.monedas          // { cp, sp, ep, gp, pp } — dinero en mano (campo existente)
pj.monedas_guardado // { cp, sp, ep, gp, pp } — dinero guardado/banco (campo nuevo, opcional)
```

`PJEquipmentSection` agrupa el equipo en dos sublistas: "Portando" y "Guardado", cada una con subtotal propio. El totalizador combinado ("Valor total del inventario") suma precios de equipo + armas (portando y guardado). Convierte todo a cobre usando tasas D&D 5e estándar: 1pp=1000cp, 1gp=100cp, 1ep=50cp, 1sp=10cp. El output omite electrum y muestra solo denominaciones no-cero en orden pp→gp→sp→cp.

Las secciones de monedas (en mano y guardadas) muestran las denominaciones en orden descendente: pp, gp, ep, sp, cp. Los labels usan nombres completos: platino, oro, electrum, plata, bronce.

### Atributos en formulario de mecánicas (`PJMechanicsTab`)

En la grilla de atributos del formulario de edición, el label de cada atributo muestra el modificador calculado automáticamente junto al nombre (`FUE  +3`). El modificador se recalcula en tiempo real al cambiar el valor del input. Implementado con `abilityMod` de `helpers/pjCalc.js`. Layout: flex row con `justify-between` — nombre a la izquierda, modificador a la derecha.

### Hechizos en fichas de PJ (`PJSpellsSection`, `SpellDetailModal`, `SpellsCRUD`)

Cada entrada en `pj.hechizos[]` tiene el siguiente schema — todos los campos nuevos son opcionales (retrocompatibles con datos anteriores):

```js
{
  id,                    // number (Date.now() al crear)
  nombre,                // string
  nivel,                 // number 0–9 (0 = truco), 10 = habilidad
  preparado,             // boolean — false por defecto
  escuela,               // string libre (Evocación, Conjuración, etc.)
  casting_time,          // string libre
  alcance,               // string libre
  componentes,           // string libre
  duracion,              // string libre
  concentracion,         // boolean
  ritual,                // boolean
  descripcion,           // string (texto largo)
  a_niveles_superiores,  // string (texto largo, opcional)
}
```

**Lógica de color en chips (`PJSpellsSection`):** `isPrepared = h.preparado || Number(h.nivel) === 0 || Number(h.nivel) === 10`. Los trucos (nivel 0) y las habilidades (nivel 10) son siempre activos implícitamente. Chip rojo (`bg-accent`) si preparado/activo, gris (`bg-bg-mid`) si no. Badges `C`/`R` dentro del chip para concentración y ritual.

**Formulario (`SpellsCRUD`):** inline CRUD con `{ ...EMPTY, ...h }` en `startEdit` para backfill de campos faltantes en hechizos guardados antes de este schema. La sección "A niveles superiores" es colapsable vía `showUpcast` state.

### SRD / Referencia D&D 5e (`SRD.jsx`, `src/srd/`)

La sección SRD consume la API pública de open5e (`https://api.open5e.com/v1/`) para consulta rápida durante la sesión. **Read-only — sin interacción con Firebase ni con `save`/`remove`.**

**Archivos:**
- `src/pages/SRD.jsx` — página principal con `activeTab` state. `key={activeTab}` en el componente activo fuerza remount/reset de estado al cambiar pestaña (intencional).
- `src/srd/srdApi.js` — capa de API. Una función por endpoint: `fetchSpells`, `fetchMonsters`, `fetchConditions`, `fetchWeapons`, `fetchArmors`, `fetchMagicItems`. Maneja URL building, paginación (`next` URL) y errores.
- `src/srd/srdCommon.jsx` — hook `useTabFetch(fetchFn)` y primitivos UI compartidos (`SRDDetailHeader`, `SRDList`).
- `src/srd/SpellsTab.jsx`, `MonstersTab.jsx`, `ConditionsTab.jsx`, `WeaponsTab.jsx`, `ArmorsTab.jsx`, `MagicItemsTab.jsx` — componentes por pestaña.

**Pestañas:** Hechizos (`/v1/spells/`), Monstruos (`/v1/monsters/`), Condiciones (`/v1/conditions/`), Armas (`/v1/weapons/`), Armaduras (`/v1/armor/`), Ítems mágicos (`/v1/magicitems/`).

**Parámetros API críticos:** spell level usa `level_int`; monster CR usa `cr` como param de URL (el campo en los objetos retornados es `challenge_rating`).

**`useTabFetch`:** inicializa `loading: true` (evita flash de estado vacío), usa ignored-flag para prevenir race conditions en fetches concurrentes.

**Detalle inline:** mismo patrón `selectedItem` / `← Volver` que el resto de la app. `SRDDetailHeader` incluye IntersectionObserver para fade-in del nombre en la barra sticky.

**Datos defensivos:** `open5e` puede retornar `school` como string u objeto `{ name }`, `desc` como array o string, `speed` como string u objeto. Todos los componentes de detalle manejan ambas formas.

### Agregar un nuevo tipo de entidad

1. Crear `src/pages/MiEntidad.jsx` con patrón de detalle inline (`selectedId` state).
2. Agregar la entrada en `FORM_COMPONENTS` en `FormModal.jsx` (incluir `EstadoField`).
3. Agregar entrada en `NAV` en `Sidebar.jsx`.
4. Agregar entrada en `PAGES` en `App.jsx`.
5. Agregar la clave al objeto `db` en `seed.js` y en `defaultData`.
6. Inicializar la colección en Firestore con `seedCollectionIfEmpty` en `App.jsx`.
7. Filtrar el listado con `isVisible(entity, isDM, currentPlayer)`.
8. Usar `<WikiText text={campo} />` en campos de texto largo del detalle.
9. Agregar la colección a `COLLECTION_LETTER` en `wikiHelpers.js` para que sea enlazable con wiki-links.
10. Usar el patrón sticky name-in-header (`nameRef`, `backBarRef`, `IntersectionObserver`) en la vista de detalle.
