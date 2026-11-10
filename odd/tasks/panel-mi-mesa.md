# Campaign panel "Mi mesa" (phase 1)

Implement the chosen artboard `C:\Dev\TTRPGManager\design\panel-campana\03-mi-mesa.html` as the campaign dashboard (`src/campaign/CampaignDashboard.tsx`).
Branch: feat/campaign-hub. Classification: large. Phase 1 = existing data only, NO migrations / schema / RLS changes (user decision, L2).
Tokens: `C:\Dev\TTRPGManager\design\system.md` (Tailwind tokens already in tailwind.config.js; square corners, accent via `accent*` classes).

## Specs

- S1 (artboard + comment 58exbq2y): "Incluye el banner como background con un gradiente al color de fondo en el borde inferior". Source: `campaign.branding.banner_url` via `parseBannerUrl` (render as `<img>`, never CSS url()). No banner → plain background. Replaces the old PanelHeader, StatsRow, "PNJs recientes" and "Últimos artículos".
- S2 Greeting: "Hola, {display_name}" (hub profile). Player subtitle: "{n} novedades desde tu última visita"; DM subtitle: "{n} cosas para preparar" (n = items of S8 with count > 0).
- S3 Próxima sesión card (both roles): date block (month, day, weekday), "Próxima sesión · en N días" (hoy / mañana), "Sesión {último número + 1}", hora_inicio–hora_fin, "{a} de {b} jugadores disponibles" computed from `player_availability` on the slot day (players = members with role player; available = userIdsAvailableOnDay minus userIdsUnavailableOnDay, restricted with rowsForCampaign). Player: link "Marcar mi disponibilidad" → /calendario (no RSVP buttons in phase 1). DM: links "Abrir sesión en vivo" → /sesion-en-vivo and calendar. Empty: "No hay una próxima sesión agendada."
- S4 Mi personaje (player only, first of `myCharacterIds` that exists): portrait (`imagen_url`, else initial), name, "raza · clase · región" (only enabled builtins), "Hoja completa →" link. Comment kmj8ail2 verbatim: "Mostrar - Nivel (Si el sistema de la campaña lo utiliza) - Economía: acumulado total de unidades de la denominación menor en todas las instancias, convertido a la unidad de mayor denominación." Level visible only when `system.character.builtins.nivel.enabled` (comment xbh4xj4w: "esto debe ser configurable en los ajustes. No debe verse en el panel" — already configurable in Ajustes; no toggle on the panel). Economy: sum of `monedas` + `monedas_guardado` (all instances) in the smallest unit, divided by the largest unit's value, shown with up to 2 decimals es-AR + largest label, plus detail line "{x} encima · {y} guardado". Denominations: `rewardTarget(system.sheet)` mode monedas → sheet rows (value = worth in smallest) over pjs.monedas/monedas_guardado; mode economia → amounts in `pj[key]` (no saved part); legacy → TO_CP rates (helpers/pjInventory.js) with keys of `system.currency.denominations`, hidden when `currency.enabled` is false; mode none → hidden. Card-flag custom fields ("Mostrar los campos que hayan sido configurados para mostrar en tarjeta de personaje") are PHASE 2 (no flag exists).
- S5 Accesos (comment nukcmqrr: "Mover estos accesos a una columna debajo de la imagen"): a vertical column under the portrait. Phase 1 links (no deep-link to PJ tabs exists): "Ver ficha" → PJ page, "Mis notas" → /notas, "Mi disponibilidad" → /calendario.
- S6 Labels above values (comment 4yiozbcp: "Colocar título arriba de todo") in the level/economy boxes.
- S7 El grupo (both roles): visible PJs as tiles. Comment ad6w9w0u verbatim: "No rellenar espacio, todos los personajes deben tener el mismo tamaño" (fixed-width grid tiles, wrap, no stretching). Tile: initial/portrait, nombre, "clase · nivel" (nivel only when enabled). Viewer's own PJ highlighted (accent-dim border). Link → PJ page.
- S8 Para preparar (DM only): rows with counts, only when > 0: "Jugadores sin disponibilidad para la próxima sesión" (names), "Sesiones sin resumen" (numbers, non-avance), "PNJs sin imagen" (first names). None → "Nada pendiente."
- S9 Desde tu última visita (player): newest visible entities of sesiones, pnjs, lugares, facciones, lore, items by `updated_at` (max 6), each with an unread dot when updated_at > last visit, kind + "nuevo"/"actualizado", short date, link to the entity. "Marcar leído" button sets last visit = now. Last visit is stored per campaign+user in localStorage (phase 1); first visit initializes it to now.
- S10 DM "Desde tu última visita" (comment gfzraifv verbatim: "El DM es quien actualiza casi todas las cosas, así que el dm en su vista debería ver en realidad las ultimas notas registradas por jugadores desde su última visita, y modificaciones de fichas que hayan hecho."): two groups. "Notas de jugadores": player notes (`layer.playerNotes.list`) with non-empty text, newest `updated_at` first (max 5): "{author display_name} · {character} sobre {entity name}" + excerpt; unread dot vs last visit. "Cambios en fichas": PJs with `sections_updated` stamps, newest first (max 5): "{pj} · {jugador}" + edited section names; unread vs last visit. (No author tracking in phase 1.)
- S11 Notes card: player "Mis últimas notas" (own player notes, newest 3, "sobre {entity}" + text); DM "Ganchos abiertos" (`layer.dmNotes.list(campaignId)` rows with non-empty `ganchos`, newest 3, entity name + text). Link → /notas.
- S12 Layout: two columns on desktop (left: S3, S4|S8, S7; right: S9|S10, S11), one column under 1100px; accessible landmarks/labels, visible focus, loading shows "—"/skeleton, load errors show a short message, never invented zeros.

## Tasks

| ID | Specs | Route | Commit | Done |
|----|-------|-------|--------|------|
| T1 | S1-S12 | worker (context backstop): pure data helpers + tests (dashboardData) | | [ ] |
| T2 | S1-S12 | same worker: components + CampaignDashboard rewrite + integration tests; remove dead PanelHeader/StatsRow/statDefs/PnjTiles/ArticleList | | [ ] |

## Log

- L1 (user): "Implement the design artboard design/panel-campana/03-mi-mesa.html" (title "Mi mesa (según rol)").
- L2 (user decision): "Fase 1: solo con datos existentes (recomendado)" — no migrations; RSVP, last-visit server state, card-field flag and sheet-change author are phase 2.
- L3 (parent): no deep-link to PJ tabs exists, so S5 links are Ver ficha / Mis notas / Mi disponibilidad.
