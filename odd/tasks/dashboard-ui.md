# Campaign dashboard and shell UI (pre-cutover)

Port the legacy dashboard to the hub campaign panel and adjust the campaign shell (topbar, sidebar). Branch: feat/campaign-hub
(follow-up work units). Classification: large (several areas, requirements the user listed verbatim). No DB change: the banner
is a new free key in `campaigns.branding` (jsonb, merged by `updateCampaign`).

## Specs

- S1: "El "Lema" debe llamarse en realidad "pre-título" y debe ser visible en el topbar si el campo tiene contenido (limitado a no más de 35 caracteres)."
- S2: "El menu en el sidebar izquierdo debe tener un botón flotante que permita ocultar/mostrar el sidebar."
- S3: "El panel de vista general debe seguir la estructura presente en la captura, agregando el ícono a la izquierda del encabezado, en un tamaño que iguale la altura del mismo (Abarcando lo que en la captura se ve desde "Vista general" hasta "Leyendas de Drakterima D&D 5e homebrew")."
- S4: "El encabezado debe permitir colocar una imagen de fondo como banner-background"
- S5: "Las estadísticas deben mostrarse en un formato más compacto que el de la captura, ocupando no más de dos lineas."
- S6: "La sección "Última sesión" Debe llamarse en realidad "Sesiones", incluyendo en su sección tiles (en dos columnas) para "Última sesión" y "Próxima sesión" (Tomando la siguiente sesión registrada en calendario desde el día actual)"
- S7: "Incluir secciones "PNJs Recientes" y "Últimos Artículos" (máximo 5 entradas) como se muestra en la captura"

Assumptions (revisable): the 35-character limit applies to the pre-título value (forms) and to what the topbar renders (legacy longer
values are cut with an ellipsis); the DB check stays at 140. The panel's third header line is the campaign name (the legacy
screenshot had a hardcoded subtitle there). The banner is set in Ajustes as an https URL (`branding.banner_url`).

## Tasks

| ID | Specs | Route | Commit | Done |
|----|-------|-------|--------|------|
| T1 | S1 | inline: rename Lema → Pre-título, 35-char limit in forms, topbar shows it above the name | f71678b | [x] |
| T2 | S2 | inline: floating show/hide button for the sidebar | 4969def | [x] |
| T3a | S4 | inline: Ajustes field + parser for `banner_url` (`parseBannerUrl`) | 9e2ba51 | [x] |
| T3b/T4 | S3, S4, S5, S6, S7 | inline (the worker was unavailable: writer repository preparation failed): rewrite `CampaignDashboard` (header with icon + banner, compact stats, Sesiones tiles, PNJs recientes, Últimos artículos) | fd8733d | [x] |

### Design for T3b/T4 (decided by the parent after reading the code)

- Data: `useEntities('sesiones'|'pjs'|'pnjs'|'lugares'|'facciones'|'lore'|'items')` and `useDisponibilidad()` (src/campaign/entities). RLS decides what each viewer gets; also filter with `canSee(entity, isDM)` (src/campaign/sections/format.ts). Pure logic goes in `src/campaign/dashboard/dashboardData.ts` with unit tests; the page is `src/campaign/CampaignDashboard.tsx`.
- Header block (S3): eyebrow "Vista general", h1 "Panel de campaña", third line = campaign name (italic). Left icon = campaign logo (`parseLogoUrl(branding.logo_url)`, else `BrandMark`) whose height equals the text block's height (flex row, `self-stretch` + `aspect-square`; verify in the browser). Remove the old "Tu rol" line and the "Secciones" grid (the sidebar already has them). Keep the DM button "Pantalla de Sesión" linking to `/c/:slug/sesion-en-vivo` (DM only), like the legacy dashboard.
- Banner (S4): `parseBannerUrl(branding.banner_url)` rendered as an `<img data-testid="panel-banner" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover">` inside the header block (never CSS `url()`), with a dark gradient overlay so the text stays legible; no banner → no img.
- Stats (S5): six compact chips in one wrapping row (icon + number + label inline, each a link to its section): sesiones (not tipo 'avance'), jugadores (pjs), pnjs, lugares, facciones, lore. Must fit in at most two lines at desktop width.
- Sesiones (S6): section divider "Sesiones" with two tiles in two columns (stack on mobile): "Última sesión" = last visible session that is not tipo 'avance' in timeline order (the list is already ordered; take the last), showing title (or "Sesión N"), a ≤220-char `plainText` summary ("Sin resumen." when empty), linking to its detail; "Próxima sesión" = the earliest `disponibilidad` slot with `fecha_inicio >= today` (today = local date YYYY-MM-DD), showing "Sesión {last numero + 1}" and the es-AR date (parse YYYY-MM-DD as local, never `new Date(str)`) plus `hora_inicio` when present, linking to /calendario. Each tile has an empty state ("Todavía no hay sesiones." / "No hay una próxima sesión agendada.").
- PNJs recientes (S7): up to 5, newest first (`created_at` desc, id desc), tiles with nombre, rol and `RelacionTag`, linking to `entityPath(slug,'pnjs',id)`.
- Últimos artículos (S7): up to 5 across lugares, facciones, lore, items, newest `created_at` first; row = icon + type label (Lugar, Facción, Lore, Ítem), date (es-AR, "28 may 2026"), name (`nombre` or `titulo`), one-line `plainText(descripcion)` preview; link to the entity detail. Empty state text without the legacy "Zona DM" hint.
- Existing tests that depend on the old dashboard: src/campaign/campaign.test.tsx and src/app/hardening.test.tsx (they look for h1 named after the campaign and for "Tu rol"); update them to the new header (h1 "Panel de campaña"; the role is no longer shown on the dashboard, keep role coverage through the sidebar/Ajustes assertions).
- Copy is Spanish (the app's UI language); identifiers and comments are English.

## Evidence

- 2026-10-25: vitest src/campaign + src/app 951 tests (one assertion that depended on the old h1 was updated), tsc and eslint clean. RED observed for every unit (pre-título topbar, sidebar toggle, banner field, dashboard data + page). Browser check on the local stack (Playwright, DM): pre-título above the name in the topbar, floating sidebar button hides/shows the menu and the content reflows, panel header with the icon at the left and the banner image behind it, compact stats in one row, Sesiones tiles in two columns, PNJs recientes, Últimos artículos (5). Not verified: mobile layout, a player view in the browser, a very long banner image, a real logo URL. Pre-existing: the h1 shows a focus ring after navigation (focus management moves to the heading).

## Log

- L1 (user, 2026-10-25): "La interfaz debe seguir estos puntos, basado en la captura adjunta:
- El "Lema" debe llamarse en realidad "pre-título" y debe ser visible en el topbar si el campo tiene contenido (limitado a no más de 35 caracteres).
- El menu en el sidebar izquierdo debe tener un botón flotante que permita ocultar/mostrar el sidebar.
- El panel de vista general debe seguir la estructura presente en la captura, agregando el ícono a la izquierda del encabezado, en un tamaño que iguale la altura del mismo (Abarcando lo que en la captura se ve desde "Vista general" hasta "Leyendas de Drakterima D&D 5e homebrew").
- El encabezado debe permitir colocar una imagen de fondo como banner-background
- Las estadísticas deben mostrarse en un formato más compacto que el de la captura, ocupando no más de dos lineas.
- La sección "Última sesión" Debe llamarse en realidad "Sesiones", incluyendo en su sección tiles (en dos columnas) para "Última sesión" y "Próxima sesión" (Tomando la siguiente sesión registrada en calendario desde el día actual)
- Incluir secciones "PNJs Recientes" y "Últimos Artículos" (máximo 5 entradas) como se muestra en la captura"
- L2 (user, 2026-10-25): campaign switcher moves from the topbar to the sidebar footer (menu opens upward, footer fixed while the links scroll), and Administración goes right below Panel. Done inline; vitest src/campaign + src/app 959 passing, tsc and eslint clean; browser check: menu opens upward, Escape closes it, choosing a campaign navigates.
- L3 (user, 2026-10-25): user menu without the chevron and with a hover background from its left edge to the avatar centre (d07c438). "El icono de rpg quester que va por defecto si no hay logo personalizado, debe tomar el color de acento configurado": BrandMark gains an `accent` prop (stroke rgb(var(--accent-rgb))) used for the campaign fallback in the topbar, panel header, hub tiles, previews and request tiles; the hub header mark keeps the brand gradient. vitest src 1687 passing, tsc clean, eslint 0 errors; checked in the browser.
