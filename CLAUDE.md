# CLAUDE.md

Este archivo provee orientación a Claude Code (claude.ai/code) cuando trabaja en este repositorio.

## Comandos

```bash
npm run dev       # Servidor de desarrollo (Vite, localhost:5173)
npm run build     # Build de producción (salida en dist/)
npm run preview   # Vista previa del build de producción
```

No hay test runner configurado.

El proyecto está deployado en GitHub Pages: `https://germansilva.github.io/DrakterimaWikiApp/`
El deploy se dispara automáticamente al pushear a `main` vía `.github/workflows/deploy.yml`.

## Arquitectura

**dragones-wiki** es una SPA (Single Page Application) para gestionar la campaña de D&D "Leyendas de Drakterima". Stack: React 18 + Vite 5, sin backend propio.

### Fuente de verdad y sincronización

Los datos viven en **Firebase Firestore**. La app usa `onSnapshot` para sincronización en tiempo real entre múltiples pestañas/usuarios sin necesidad de recargar.

- **`src/firebase.js`**: inicializa Firestore con las 6 vars `VITE_FIREBASE_*` y habilita persistencia offline con `enableMultiTabIndexedDbPersistence`.
- **Colecciones Firestore**: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`, `player_notes`. Los documentos usan el `id` numérico convertido a string como doc ID.
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

### Esquema de datos (`seed.js`)

El objeto `db` tiene ocho colecciones: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`, `player_notes`. Cada ítem tiene un `id` numérico asignado por `nextId()` (máximo id existente + 1).

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

### Navegación y detalle inline

Todas las páginas de entidades usan **detalle inline** (no panel lateral): cada página tiene un estado local `selectedId` (null = lista, non-null = detalle). Al seleccionar un ítem se renderiza el componente de detalle con un botón "← Volver".

La única excepción es `items`, que todavía usa `DetailPanel` (panel slide-in derecho).

Para navegar directamente a un ítem desde otra página (ej. Dashboard → sesión específica), se usa el mecanismo `pendingDetail`:
- `goToDetail(page, id)` en el contexto: setea la página y guarda `{ id }` en `pendingDetail`.
- La página destino inicializa `selectedId` con `pendingDetail?.id ?? null` y llama `consumePendingDetail()` en un `useEffect` al montar.

### Formularios

Los formularios abren en `FormModal` (modal centrado). El título y las acciones (guardar/eliminar/cancelar) son `position: sticky` (top y bottom respectivamente), con el contenido scrolleable en el medio. Al hacer click fuera del modal, pide confirmación si hay campos con contenido.

Cada formulario incluye el componente `EstadoField` para controlar la visibilidad de la entidad.

### Imágenes

Todas las entidades que muestran imagen usan un campo `imagen_url` (texto con URL externa). Los formularios tienen un input de tipo `url` con preview en tiempo real. En las vistas de detalle se muestra la imagen con `onError` para ocultarla si la URL es inválida.

### Autenticación

- **DM**: contraseña en `VITE_DM_PASSWORD` (GitHub Secret, bakeada en el bundle). Sesión en `sessionStorage` como `drakterima_dm = '1'`.
- **Jugadores**: contraseñas en `VITE_PLAYER_1_PASSWORD` … `VITE_PLAYER_6_PASSWORD` (GitHub Secrets). Mapeadas por id de PJ en `PLAYER_PASSWORDS` en `App.jsx`. Sesión en `sessionStorage` como `drakterima_player` (JSON `{ id, nombre }`).
- `tryAccess(password)` en el contexto: prueba primero DM, luego jugadores.
- El modal de acceso está en `Sidebar.jsx` (`AccessModal`). Se abre con el botón "Acceder" cuando no hay sesión activa.

### Campos privados DM

Varios tipos tienen campos privados (`notas`, `secreto`) visualmente diferenciados con `var(--accent)` / `var(--accent-bright)` y un ícono de candado. Solo visibles cuando `isDM === true`.

### Helpers (`helpers.js`)

- `regionLabel` / `regionOptions`: valores canónicos de región (`magral`, `nezor`, `heladas`, `islas`, `otro`).
- `relacionLabel`: valores canónicos de relación (`aliado`, `neutral`, `enemigo`, `desconocido`).
- `nextId(arr)`: incrementa el máximo id.
- `nl2br(text)`: convierte `\n` a `<br>` para `dangerouslySetInnerHTML`.
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

### Agregar un nuevo tipo de entidad

1. Crear `src/pages/MiEntidad.jsx` con patrón de detalle inline (`selectedId` state).
2. Agregar la entrada en `FORM_COMPONENTS` en `FormModal.jsx` (incluir `EstadoField`).
3. Si necesita panel de detalle lateral, agregar en `DETAIL_VIEWS` en `DetailPanel.jsx`.
4. Agregar entrada en `NAV` en `Sidebar.jsx`.
5. Agregar entrada en `PAGES` en `App.jsx`.
6. Agregar la clave al objeto `db` en `seed.js` y en `defaultData`.
7. Inicializar la colección en Firestore con `seedCollectionIfEmpty` en `App.jsx`.
8. Filtrar el listado con `isVisible(entity, isDM, currentPlayer)`.
