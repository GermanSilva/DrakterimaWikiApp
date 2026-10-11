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
npm run dev               # Vite, http://localhost:5173
npm run build             # build de producción (salida en dist/)
npm run preview           # sirve el build
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm test                  # vitest run (jsdom, unitarios; excluye src/data/integration)
npm run test:watch        # vitest en modo watch
npm run test:integration  # vitest contra la pila local de Supabase (requiere `supabase start`)
npm run db:types          # regenera src/data/database.types.ts (requiere `supabase start`)
npm run db:import         # importador Firestore -> Supabase (ver scripts/import/README.md)
supabase start            # pila local (Docker): Postgres, Auth, Realtime, Studio, Mailpit
supabase db reset         # reaplica migraciones + supabase/seed.sql (solo local)
supabase test db          # pruebas pgTAP de supabase/tests/database (requiere `supabase start`)
```

Ver qué comandos son seguros contra qué entorno en [`docs/hosting-and-cutover.md`](docs/hosting-and-cutover.md).
Operaciones remotas (Supabase alojado, Vercel, Google Cloud, Firebase, `gh` con escritura) **solo con autorización
explícita por operación**; nunca ejecutar `supabase config push` (sobrescribiría Auth alojado con valores locales).

Un cambio no se da por bueno sin `npx vitest run`, `npm run lint` (0 errores; hay warnings preexistentes),
`npx tsc --noEmit` y `npm run build`. Los cambios de esquema además requieren `supabase test db`.

## Principios de diseño

- **Clean architecture**: cada componente o módulo tiene una única responsabilidad. Las fronteras entre capas son claras:
  datos (`src/data`), puertos (`src/ports`), estado/contexto de campaña (`src/campaign`), presentación (componentes).
- **YAGNI**: no agregar abstracciones ni features especulativos.
- **La base de datos es el límite de seguridad**: RLS decide qué ve y escribe cada usuario. La UI oculta botones por
  comodidad, nunca como control de acceso.
- **Las escrituras pasan por la capa de datos** (`src/data`), con `create` / `update(patch)` explícitos; no hay
  sobrescritura de filas enteras. Excepción: la app legacy (ver su sección).

## Arquitectura

SPA React 18 + Vite 5 + TypeScript parcial (`allowJs`, `strict`; los módulos nuevos son `.ts/.tsx`, parte del código
heredado sigue en `.jsx`). Backend: **Supabase** (Postgres con RLS, Auth, Realtime). Hosting previsto: **Vercel**
(`vercel.json`). La app es un **hub multi-campaña**: un usuario tiene una identidad global y pertenece a varias campañas
con un rol por campaña (DM o jugador). Documento de seguimiento de la migración: `odd/tasks/campaign-hub.md`.

`src/main.jsx` monta `ErrorBoundary > ConfigGate > AuthProvider > HubDataProvider > RouterProvider`. `ConfigGate` muestra
"Falta configurar Supabase" si faltan `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (también bloquea `/legacy`).

### Rutas (`src/app/routes.tsx`, detalle en [`src/app/README.md`](src/app/README.md))

| Ruta | Pantalla |
| --- | --- |
| `/login`, `/auth/callback` | login (magic link / Google) y fin del flujo PKCE |
| `/` | `HubHome`: mis campañas; crear campaña (solo Hub Owner) o solicitarla; bandeja de solicitudes del owner; unirse con código |
| `/invite/:code` | `InvitePage`: vista previa + confirmación explícita ("Unirme") |
| `/profile` | perfil |
| `/c/:slug` | `CampaignLayout` (carga campaña y rol, provee `CampaignContext`) + dashboard |
| `/c/:slug/:section`, `/c/:slug/:section/:id` | sección de la campaña (lista y detalle por URL) |
| `/legacy/*` | app legacy Firebase, import dinámico |

Todo salvo el login es lazy. `/`, `/invite/*`, `/profile` y `/c/*` exigen sesión (`RequireAuthRoute`). El parámetro `next` se
valida (`safeNext.ts`). La app legacy **nunca** se importa de forma estática desde `routes.tsx` (hay test); no pasar
`import.meta.env` entero a ningún lado (Vite incrustaría todos los `VITE_*`): leer cada clave por separado.

### Mapa de carpetas

| Carpeta | Contenido |
| --- | --- |
| `src/app/` | router, rutas, `ConfigGate`, proveedor de datos del hub, `LegacyApp` |
| `src/auth/` | `AuthProvider`/`useAuth`, login, callback, perfil. Ver [`src/auth/README.md`](src/auth/README.md) |
| `src/hub/` | pantallas fuera de una campaña: lista, crear/unirse, invitación, perfil, 404 |
| `src/campaign/` | contexto y shell de campaña, registro de secciones, páginas por sección, hooks de entidades |
| `src/data/` | capa de datos tipada sobre Supabase. Ver [`src/data/README.md`](src/data/README.md) |
| `src/ports/` | interfaces (wiki, no leídos, notas de jugador, formularios, pantalla de sesión) que desacoplan los componentes compartidos |
| `src/legacy/` | adaptadores de los puertos para la app legacy (`LegacyPortsProvider`) |
| `src/components/`, `src/hooks/`, `src/helpers/` | componentes y utilidades compartidos por hub y legacy |
| `src/pages/` | páginas heredadas (legacy) y piezas que el hub reutiliza (`pages/pj`, `pages/session`, mapas) |
| `supabase/` | `config.toml`, `migrations/`, `seed.sql` (solo local), `tests/database` (pgTAP) |
| `scripts/` | `import-firestore.mjs` + `scripts/import/` (importador), `gen-db-types.mjs` |
| `docs/` | `hosting-and-cutover.md` (runbook) y material de planificación |
| `odd/tasks/` | documento de seguimiento de la feature `campaign-hub` |

### Campaña y secciones

`useCampaign()` (solo dentro de `/c/:slug`) devuelve `{ campaign, role, isDM, myCharacterIds, reload }`. La campaña lleva su
branding (`accent_color` `#rrggbb`, `logo_url` https), regiones y campos de personaje propios.

`src/campaign/sections.ts` es el **registro único** (`SECTIONS`) que usan el sidebar, el dashboard y el router:
`notas`, `sesiones`, `calendario`, `pjs`, `pnjs`, `mapas`, `lugares`, `facciones`, `lore`, `homerules`, `items`, `juegos`,
`srd` (placeholder: la referencia SRD solo existe en la app legacy), y las `dmOnly` `sesion-en-vivo` y `ajustes`. `dmOnly`
oculta el enlace y da 404 al jugador, pero el límite real es RLS. Las páginas viven en `src/campaign/sections/`.

- **Lista y detalle son una sola ruta** (`/c/:slug/<sección>[/:id]`), con filtros en query params. `EntitySectionRoute`
  resuelve lista/detalle/id inválido; `:id` solo es válido si cumple `^[0-9]{1,15}$`.
- **Ajustes** (solo DM, `AjustesPage`): Campaña (nombre, logo, color, lema), Regiones, Campos de personaje, enlace a Sesión
  en vivo, Juegos (lotería, pozo, registro), Jugadores (roles, dueños de PJ, traspaso de DM), Invitaciones, Exportar y Zona de
  peligro (borrar campaña escribiendo el slug). Para una tarea de administración nueva, agregar una sección ahí.
- **Sesión en vivo** (`/c/:slug/sesion-en-vivo`, `SesionEnVivoPage` sobre `SessionScreenView`): pantalla del DM con cards;
  el layout se guarda en `campaign_config` (clave `session_screen`, visibilidad `dm`).
- **Mapas** (`/c/:slug/mapas`): Leaflet con `CRS.Simple`, solo dentro del chunk lazy `LeafletCanvas`; puntos con coordenadas
  normalizadas 0..1 y navegación jerárquica por `?trail=`.
- **PJs**: el dueño de un personaje solo edita campos de identidad (`pjOwnerFields.ts` refleja el trigger
  `guard_pj_player_update`); el DM edita todo. Ver [`src/app/README.md`](src/app/README.md) (sección de personajes).

### Datos (`src/data`)

`createDataLayer()` agrupa un repositorio por tabla/RPC. Contrato (lo hacen cumplir los permisos de columna y los tests,
detalle en [`src/data/README.md`](src/data/README.md)):

- Todo SELECT usa una lista explícita de columnas de `columns.ts`: nunca `*` ni `visible_to` (los clientes no tienen
  privilegio sobre esa columna; falla con 42501). El DM lee/escribe `visible_to` solo con las RPC `get_entity_visibility` /
  `set_entity_visibility`.
- Campos privados del DM (`notas`, `secreto`, `ganchos`) viven en `entity_dm_notes` (tabla no publicada en Realtime), no en la
  fila de la entidad. Los formularios que mezclan ambos usan `saveEntityWithDmNotes`.
- Una entidad plana = columnas promovidas + claves de `data` (jsonb) + `campaign_id`, `created_at`, `updated_at`,
  `created_by`. Los `update` envían solo lo cambiado; las columnas jsonb se fusionan con control optimista por `updated_at`
  (`ConflictError`).
- Errores: `DataError` con `kind` y `reason` estables. Listados paginados con `.range()`, tope 20 000 filas.
- Realtime por tabla con `useCampaignTable` (re-lista en cada `SUBSCRIBED`); en el hub se comparte vía `TableStore` y los
  hooks de `src/campaign/entities/` (`useEntities`, `useEntity`, `useEntityActions`, `useDmNotes`, `useVisibility`...).
- Los ids son identidades de Postgres **globales por tabla** (no hay `nextId` en el cliente). El import conserva los ids
  legacy para que sigan resolviendo los wiki-links `[[{3G}Texto]]` dentro de la campaña.

Para agregar una tabla de entidad: migración (con RLS, y concesión de columnas explícita si lleva `visible_to`), lista en
`columns.ts`, repositorio, regenerar `database.types.ts` (`npm run db:types`), prueba pgTAP y registro en `SECTIONS`.

### Base de datos (`supabase/`)

Migraciones en `supabase/migrations/` (identidad, campañas, miembros, invitaciones, entidades, notas, lecturas, calendario,
juegos, mapas, presencia, endurecimientos). 25 tablas, todas con RLS. Modelo de privilegio de plataforma (H15): `hub_owners` (solo se escribe con service_role o SQL Editor; `is_hub_owner()`); `create_campaign` es solo para owners y las demás personas piden una campaña en `campaign_requests`, que el owner decide con `approve_campaign_request` (el SOLICITANTE queda como DM) o `reject_campaign_request`; la creación vive en `create_campaign_for` (no ejecutable por la API). Endurecimiento H15b: `campaigns.slug` es inmutable por la API (sin `update (slug)`; lista de reservados única en `is_reserved_slug()`), `decided_by` no es legible por la API (el `select` de `campaign_requests` lista columnas, nunca `*`), tope de 3 pendientes y 10 solicitudes **vigentes** por 24 h por persona (`too_many_requests_recently`; no cuenta las canceladas, porque cancelar borra la fila) y se quitan caracteres de control/bidi del texto de la solicitud. El primer owner se asigna a mano con SQL ANTES de abrir el registro (`docs/hosting-and-cutover.md` d.6); el owner del seed (UUID fijo) nunca debe llegar a una base alojada. RPC principales: `create_campaign`, `approve_campaign_request`, `reject_campaign_request`, `accept_invite`,
`preview_invite`, `play_loteria`, `assign_pot_to_character`, `delete_campaign`, `get/set_entity_visibility`. Las funciones
`SECURITY DEFINER` fijan `search_path` vacío. Realtime publica 14 tablas (sin `entity_dm_notes`). Visibilidad de entidades:
`estado` (`publicado` | `secreto` | `borrador`) + `visible_to` (ids de PJ), resuelto en `can_see_entity()`.

Pruebas: `supabase/tests/database/*.test.sql` (pgTAP, `supabase test db`). `seed.sql` crea usuarios de `example.test` y es
**solo local**.

### Autenticación

Supabase Auth: **Google OAuth es el login principal** (decisión del owner, sin dominio propio; `VITE_AUTH_GOOGLE_ENABLED=true`) y el magic link por email es la alternativa (PKCE, debe abrirse en el mismo navegador; sin dominio propio es *best-effort* y puede caer en spam). Con Google activo, `LoginPage` muestra primero el botón de Google, el divisor «o con tu email» y debajo el formulario de email con un aviso de spam; con Google desactivado la página es solo el formulario de email.
No hay contraseñas en el hub. Captcha opcional con Cloudflare Turnstile: si `VITE_TURNSTILE_SITE_KEY` (pública) está definida, la página de login muestra el widget, bloquea "Enviar link mágico" (solo ese envío; el botón de Google nunca espera token) hasta tener token y lo envía como `options.captchaToken`; sin la variable no hay widget ni token (local y tests). La clave secreta va solo en Supabase (Authentication > Attack Protection), nunca en el repo ni en una `VITE_*`. El magic link queda protegido por el captcha de Supabase; Google OAuth no.
Detalle y límites en [`src/auth/README.md`](src/auth/README.md).

### Importador (`scripts/import-firestore.mjs`)

`npm run db:import` mueve un export JSON de la app legacy a una campaña del hub (local por defecto, dry run por defecto,
destino alojado solo con las cinco condiciones documentadas). Guía de operador:
[`scripts/import/README.md`](scripts/import/README.md). Los exports contienen contraseñas legacy en texto plano: nunca al
repo (`data/db.json`, `scripts/out/` y `*.drakterima-export.json` están en `.gitignore`).

### Tests

- **Unitarios**: `npm test` (vitest + jsdom + Testing Library; incluye `scripts/import/*.test.mjs`). Config en `vite.config.js`.
- **Integración**: `npm run test:integration` (`vitest.integration.config.js`, `src/data/integration/`); lee URL y claves
  de `supabase status` y se niega a correr contra un host no local.
- **Base de datos**: `supabase test db` (pgTAP).
- Estilo de pruebas del hub: se renderizan las rutas reales con `src/app/testing/renderApp.tsx` y clientes falsos
  (`src/data/testing/`).

### Variables de entorno

| Variable | Uso | Público |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | cliente Supabase (`src/data/supabaseClient.ts`, `src/app/supabaseConfig.ts`) | sí |
| `VITE_AUTH_GOOGLE_ENABLED` | `true` (login principal); `false` oculta el botón de Google | sí |
| `VITE_TURNSTILE_SITE_KEY` | site key de Cloudflare Turnstile; vacía/ausente = sin captcha (la clave secreta va solo en Supabase) | sí |
| `VITE_FIREBASE_*`, `VITE_DM_PASSWORD`, `VITE_PLAYER_1..6_PASSWORD` | solo la app legacy | comprometidas, a retirar |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `IMPORT_ALLOW_REMOTE` | solo el importador contra un destino alojado | **secretas**, nunca en archivos |

Para desarrollo local: `supabase status` da URL y anon key. Crear `.env.local` (ignorado por git). Tabla completa de
secretos y dónde vive cada uno: [`docs/hosting-and-cutover.md`](docs/hosting-and-cutover.md).

### Despliegue

- **Hub**: Vercel. `vercel.json` hace el rewrite SPA (todo salvo `/assets/*` y `/favicon.svg` sirve `index.html`) y pone
  headers de seguridad (sin CSP todavía). `vite.config.js` usa `base: '/'`. Pasos de alta, corte y retiro:
  [`docs/hosting-and-cutover.md`](docs/hosting-and-cutover.md).
- **Legacy**: `.github/workflows/deploy.yml` sigue publicando en GitHub Pages
  (`https://germansilva.github.io/DrakterimaWikiApp/`) al pushear a `main`. Hasta el corte, `main` no recibe la rama
  `feat/campaign-hub`: con `base: '/'` el hub no funcionaría bajo `/DrakterimaWikiApp/`.

`gh` (GitHub CLI) no viene preinstalado: `scoop install gh` o `choco install gh` antes de crear PRs por comando.

### Convenciones que conviene recordar

- Texto de UI en español; código, comentarios y nombres de artefactos técnicos en inglés.
- Estilos: Tailwind + `src/styles.css` con variables CSS (`--accent`, ...); clases reutilizables en `src/constants.js`.
  El acento de campaña se aplica solo si es exactamente `#rrggbb`.
- Formularios: modal centrado (`FormShell`), con confirmación al descartar; los modales se cierran por backdrop solo si
  pointer-down y click caen ambos en el backdrop (`useBackdropClose`) y siempre tienen botón visible de cerrar.
- Títulos de detalle: `useStickyTitle` (nombre en la barra "← Volver" al salir del viewport).
- Wiki-links: `[[{NL}Texto]]` (`N` = id, `L` = letra de colección: S, P, N, G, F, L, I, M, H, ver `COLLECTION_LETTER` en
  `src/components/wikiHelpers.js`); `WikiText` también parsea Markdown básico y `[[https://...]]` como imagen inline.
- Imágenes: campo de texto con URL https externa (no hay Storage); `LazyImg` y `ImageLightbox`. El host de la imagen ve la
  IP de quien la carga.
- Nunca poner una service role key, URL de base de datos o contraseña en `VITE_*` ni en `src/`.

## App legacy (Firebase)

La app original (Firestore + contraseñas en el bundle) sigue montada en `/legacy/*` solo para comparar durante la
migración y se retira en el corte. **No es la fuente de verdad del hub.** No agregar features nuevas ahí.

- Código: `src/App.jsx` (dueño del estado `db`, `page`, `detail`, `form`), `src/AppContext.jsx` (`useApp()`),
  `src/firebase.js` (Firestore con `VITE_FIREBASE_*`), `src/seed.js`, `src/pages/*`, `src/components/{Sidebar,Header,...}`.
- Datos: colecciones Firestore `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`, `player_notes`, `mapas`,
  `map_points`, `homebrew_rules`, `game_logs`, `game_pot`, `game_config`, `login_logs`. Escrituras por `save(type, data)`
  (`setDoc` **sin merge**: sobrescribe el documento entero), `remove` y `savePlayerNote` en `App.jsx`.
- Acceso: contraseñas `VITE_DM_PASSWORD` / `VITE_PLAYER_N_PASSWORD` y sesión en `sessionStorage`. Es un control solo de UI:
  los datos secretos se descargan igual y se filtran en el cliente. Las contraseñas están en el historial de git y en el
  bundle público: se retiran en el corte.
- Los componentes compartidos con el hub (WikiText, formularios, no leídos, notas de jugador, pantalla de sesión) leen
  datos por **puertos** (`src/ports`); el adaptador legacy está en `src/legacy/`.
- Despliegue: GitHub Pages por `.github/workflows/deploy.yml`, que se elimina en el retiro (ver el runbook).
