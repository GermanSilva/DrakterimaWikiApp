# RPG Quester polish (pre-cutover)

Rename the product to "RPG Quester", new icon/logo, new campaigns view (header, tiles, modals), brand gradient,
campaign branding fields on request/create, and a user menu in the header. Branch: feat/campaign-hub (follow-up work units).
Classification: large (several sessions' worth, one unit touches the DB with security-sensitive functions).

## Specs

- S1: "La página se va a llamar "RPG Quester"" (replaces the provisional "StoryCore" in title, page titles, docs, UI copy).
- S2: "La página va a usar otro ícono y logo. El reducido, para poner como favicon y como icono de header bar va a ser una "Q" estilizada como un dado d20."
- S3: "El titulo en el header en la página principal (Vista de campañas) debe decir "RPG" en letra pequeña y "QUESTER" en la letra grande"
- S4: "Los tiles de campaña deben tener el subtítulo arriba en pequeño, El nombre de la campaña en grande en medio. Todo en uppercase"
- S5: "La vista de campañas debe Mostrar el título "Mis Campañas" a la izquierda y a la derecha los botones "Solicitar campaña" y "Unirme a campaña". Estos botones deben abrir un modal con los formularios adecuados. El resto de la vista debe ser una lista con los tiles de campañas de la cuenta."
- S6: "Al solicitar o crear campaña se debe ingresar un nombre, un pre-título (opcional), la dirección, un color de acento, y el url al logo (Opcional). En el modal debe haber un encabezado con la vista previa de lo ingresado, con los placeholders "Nueva campaña" (título), "RPG Quester presenta" (pre-título), y el logo icono si no se ingresó url." Decision (user): the pre-título IS the existing `branding.tagline` (Lema); no new field.
- S7: "El color en los textos y el fondo de los colores debe ser el gradiente principal. Al entrar a una campaña, el acento debe adoptar el color elegido al crear o solicitar campaña." Decision (user): the main gradient is the image `C:\Users\Usuario\Downloads\gradient.png`; sampled colours: magenta #9c2d8c, indigo #4a32ac, cyan #4aaed8 (light pink highlight #d082b4). Working assumption (revisable in the browser): linear 135deg magenta → indigo → cyan on hub texts/accents/backgrounds; inside a campaign the accent is the chosen colour (existing `accentStyle`).
- S8: "En el header, la parte derecha sólo debe tener el nombre de jugador y el ícono/foto como un área clickeable que abra un cuadro flotante debajo, con las opciones "editar perfil", "ver mis campañas" y "cerrar sesión"."

## Tasks

| ID | Specs | Route | Commit | Done |
|----|-------|-------|--------|------|
| T1 | S1, S2, S7 | inline: rename, d20-Q favicon/logo SVG, gradient tokens, document titles, docs | 6771244 | [x] |
| T2 | S6, S7 | inline, HIGH RISK (own commit, pgTAP, independent verify): `campaign_requests` gains optional `tagline`, `accent_color`, `logo_url` (insert grant + validation), `create_campaign` / `approve_campaign_request` / `create_campaign_for` write them into `campaigns.branding` | 885d8dc | [x] |
| T3 | S8 | inline: header user menu (name + avatar button, floating panel: editar perfil, ver mis campañas, cerrar sesión), keyboard/a11y | 4aef7a9 | [x] |
| T4 | S3, S4, S5 | inline: hub header "RPG / QUESTER", "Mis Campañas" title + two buttons opening modals (request/create for owners, join), tile list | ed48674 | [x] |
| T5 | S6, S7 | inline: request/create modal with live preview header (placeholders), fields name, tagline, slug, accent colour, logo url | 7de10c7 | [x] |
| T6 | S7 | inline: verify accent adoption on entering a campaign; browser check (Playwright) of all views | 5ea1386 | [x] |

## Open items

- Cutover (H14) waits for this polish; the Supabase Email provider will be disabled by the owner and the login form hidden by a flag (queue after T6).

## Log

- L1 (user, 2026-10-23): "Esta es la primera parte de los cambios:
- La página se va a llamar "RPG Quester"
- La página va a usar otro ícono y logo. El reducido, para poner como favicon y como icono de header bar va a ser una "Q" estilizada como un dado d20.
- El titulo en el header en la página principal (Vista de campañas) debe decir "RPG" en letra pequeña y "QUESTER" en la letra grande
- Los tiles de campaña deben tener el subtítulo arriba en pequeño, El nombre de la campaña en grande en medio. Todo en uppercase
- La vista de campañas debe Mostrar el título "Mis Campañas" a la izquierda y a la derecha los botones "Solicitar campaña" y "Unirme a campaña". Estos botones deben abrir un modal con los formularios adecuados.
El resto de la vista debe ser una lista con los tiles de campañas de la cuenta.
- Al solicitar o crear campaña se debe ingresar un nombre, un pre-título (opcional), la dirección, un color de acento, y el url al logo (Opcional). En el modal debe haber un encabezado con la vista previa de lo ingresado, con los placeholders "Nueva campaña" (título), "RPG Quester presenta" (pre-título), y el logo icono si no se ingresó url.
- El color en los textos y el fondo de los colores debe ser el gradiente principal. Al entrar a una campaña, el acento debe adoptar el color elegido al crear o solicitar campaña.
- En el header, la parte derecha sólo debe tener el nombre de jugador y el ícono/foto como un área clickeable que abra un cuadro flotante debajo, con las opciones "editar perfil", "ver mis campañas" y "cerrar sesión"."
- L2 (user): the pre-título is the existing Lema (tagline); reuse it.
- L3 (user): the main gradient is the image gradient.png (sampled colours in S7).
- T2 evidence (2026-10-23): migration `20261023120000_campaign_request_branding.sql` (request columns `tagline`/`accent_color`/`logo_url` with named-reason trigger validation + CHECK constraints, `create_campaign_for(uuid,text,text,jsonb)` validates and stores branding, `create_campaign` gains three optional args, `approve_campaign_request` copies the branding; old overloads dropped). pgTAP 15 (33 assertions; fails before the migration) and a clean `supabase db reset`: 564 assertions pass; integration 92/92; vitest 1750/1751 (known load flake `loginReturn`, passes alone); tsc, lint 0 errors. Independent read-only verification (gentle-ai-verify): no blocker/high; findings applied: named reasons on the request path, same control-character cleaning on both paths, probes for the dropped overloads, approval with overrides and trailing-newline accent. Open for T5: send `parseLogoUrl(...)` normalised href (the DB regex is case-sensitive on `https://`), keep the owner inbox from rendering a requester's logo as `<img>` (IP leak), message mapping for `invalid_tagline`/`invalid_accent_color`/`invalid_logo_url`. DEPLOY ORDER: `supabase db push` to staging/production BEFORE shipping the frontend of T5 (the old two-argument `create_campaign` call keeps working, but requests with the new fields fail until the migration exists). Process note: two script edits corrupted files (JS `String.replace` treats `$'` and `$$` in the replacement text specially); caught by `supabase db reset` and the pgTAP run, repaired with the edit/write tools. Migration count is now 16.
- T3-T6 evidence (2026-10-23): T3 user menu (name + avatar button, floating menu with Editar perfil / Ver mis campañas / Cerrar sesión, Escape/outside press/arrow keys), T4 hub header "RPG" small over "QUESTER" large in the brand gradient, "Mis campañas" left with the request/create + join buttons right opening dialogs, tiles with the tagline small on top and the name large, uppercase, T5 preview header in the dialogs (placeholders "Nueva campaña" / "RPG Quester presenta", brand mark when no logo) with name, pre-título, dirección, color de acento (default brand indigo) and logo URL (https only, normalised href sent). The hub owner sees "Crear campaña" instead of "Solicitar campaña" (assumption, one line to change). Every unit had its RED observed first. Final checks: hub + app + auth vitest 421/421, tsc, lint 0 errors, integration 92/92, pgTAP 564. A pre-existing race in `loginReturn.test.tsx` (sync getBy on the lazy login page; it failed more with Docker running) was fixed with findBy. Browser check (local stack, Playwright, demo DM): hub home, user menu, create dialog with live preview and accent, creation, and the campaign shell adopting `#d4145a` and showing the tagline. Not verified: staging/production deploy (needs `supabase db push` first, then the frontend), mobile layout, a real logo image URL, the request flow end to end as an ordinary user, the owner inbox with the new fields.
- Open after the polish: (1) the campaign header still shows the dragon icon when a campaign has no logo, while the dialog preview and the tiles promise the brand mark: pick one; (2) the avatar initial circle has low contrast on the dark header; (3) hide the email login form behind a flag and disable the Supabase Email provider (Google-only decision); (4) rotate the secrets in `DRAKTERIMA HUB.txt` before the cutover; (5) H14 cutover.
