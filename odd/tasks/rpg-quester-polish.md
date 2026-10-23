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
| T1 | S1, S2, S7 | inline: rename, d20-Q favicon/logo SVG, gradient tokens, document titles, docs | | [ ] |
| T2 | S6, S7 | inline, HIGH RISK (own commit, pgTAP, independent verify): `campaign_requests` gains optional `tagline`, `accent_color`, `logo_url` (insert grant + validation), `create_campaign` / `approve_campaign_request` / `create_campaign_for` write them into `campaigns.branding` | | [ ] |
| T3 | S8 | inline: header user menu (name + avatar button, floating panel: editar perfil, ver mis campañas, cerrar sesión), keyboard/a11y | | [ ] |
| T4 | S3, S4, S5 | inline: hub header "RPG / QUESTER", "Mis Campañas" title + two buttons opening modals (request/create for owners, join), tile list | | [ ] |
| T5 | S6, S7 | inline: request/create modal with live preview header (placeholders), fields name, tagline, slug, accent colour, logo url | | [ ] |
| T6 | S7 | inline: verify accent adoption on entering a campaign; browser check (Playwright) of all views | | [ ] |

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
