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

Los datos viven en `data/db.json` en el repositorio, que actúa como backend compartido. Al cargar, la app hace fetch a `raw.githubusercontent.com` para obtener la versión más reciente. Al guardar, escribe en GitHub vía la Contents API (commit automático).

- **`localStorage`** (`drakterima_wiki_v1`): caché local. Se renderiza inmediatamente al abrir la app mientras el fetch remoto se completa en background.
- **`data/db.json`**: fuente de verdad. Se actualiza con cada `persistDb()` vía GitHub API.
- **`VITE_GITHUB_TOKEN`**: fine-grained PAT con solo `Contents: Read+Write` en este repo, bakeado en el bundle por Vite en build time.
- Tanto el DM como los jugadores pushean a GitHub (necesario para que las notas de jugadores sean visibles para el DM).
- Sin token (dev local): solo localStorage, idéntico al comportamiento anterior.

### Flujo de datos

`App.jsx` es dueño de todo el estado: `db` (datos), `page` (vista activa), `detail` (panel de detalle), `form` (modal de formulario), `toastMsg`, `sidebarOpen`, `pendingDetail`, `loading` y `syncStatus`. Todas las mutaciones pasan por `save(type, data)` y `remove(type, id)`, que llaman a `persistDb()`.

`persistDb(newDb)`:
1. Actualiza React state y localStorage atómicamente.
2. Si hay `VITE_GITHUB_TOKEN`: llama a `pushToGitHub(newDb)` (async, no bloqueante). Un `pushQueue` serializa llamadas rápidas sucesivas para evitar conflictos de SHA en la API de GitHub.

`AppContext.jsx` expone el contexto (incluye `syncStatus` y `loading`); todos los componentes hijos lo consumen con `useApp()`. No se usa ninguna librería de estado externa.

### Esquema de datos (`seed.js`)

El objeto `db` tiene ocho colecciones: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`, `player_notes`. Cada ítem tiene un `id` numérico asignado por `nextId()` (máximo id existente + 1).

- `defaultData` tiene `lugares`, `facciones` y `lore` pre-cargados.
- `seedPJs`, `seedPNJs`, `seedSesiones` se inyectan en el primer load si esas colecciones están vacías.
- En el load, `Object.assign(base, JSON.parse(raw))` fusiona los datos guardados sobre los defaults.

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

### Importar / Exportar datos

`exportData()` descarga el `db` completo como `drakterima-YYYY-MM-DD.json`.
`importData(file)` lee un JSON, valida que tenga al menos una colección esperada, pide confirmación, reemplaza el `db` completo y hace push a GitHub vía `persistDb`. Ambas acciones están en el footer del Sidebar bajo la sección "Datos" (solo DM).

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

### Activos

- `src/svgs/dragonIcon.jsx`: componente React del logo SVG del dragón. Props: `width`, `height`, `fill` (default `currentColor`), `className`, `style`.
- `public/favicon.svg`: favicon SVG con `fill="#dc2626"` (rojo de la app).

### Estilos

Todos los estilos están en `src/styles.css`. Usa CSS custom properties (`--accent`, `--text-muted`, etc.) para el tema oscuro. Sin framework CSS ni CSS-in-JS.

### Agregar un nuevo tipo de entidad

1. Crear `src/pages/MiEntidad.jsx` con patrón de detalle inline (`selectedId` state).
2. Agregar la entrada en `FORM_COMPONENTS` en `FormModal.jsx`.
3. Si necesita panel de detalle lateral, agregar en `DETAIL_VIEWS` en `DetailPanel.jsx`.
4. Agregar entrada en `NAV` en `Sidebar.jsx`.
5. Agregar entrada en `PAGES` en `App.jsx`.
6. Agregar la clave al objeto `db` en `seed.js`, `defaultData`, y en el objeto raíz de `data/db.json`.
