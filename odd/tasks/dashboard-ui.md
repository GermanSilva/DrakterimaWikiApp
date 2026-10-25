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
| T1 | S1 | inline: rename Lema → Pre-título, 35-char limit in forms, topbar shows it above the name | | [ ] |
| T2 | S2 | inline: floating show/hide button for the sidebar | | [ ] |
| T3 | S3, S4 | inline: Ajustes field + parser for `banner_url`; panel header with icon, banner background | | [ ] |
| T4 | S5, S6, S7 | inline: compact stats, Sesiones tiles, PNJs recientes, Últimos artículos | | [ ] |

## Log

- L1 (user, 2026-10-25): "La interfaz debe seguir estos puntos, basado en la captura adjunta:
- El "Lema" debe llamarse en realidad "pre-título" y debe ser visible en el topbar si el campo tiene contenido (limitado a no más de 35 caracteres).
- El menu en el sidebar izquierdo debe tener un botón flotante que permita ocultar/mostrar el sidebar.
- El panel de vista general debe seguir la estructura presente en la captura, agregando el ícono a la izquierda del encabezado, en un tamaño que iguale la altura del mismo (Abarcando lo que en la captura se ve desde "Vista general" hasta "Leyendas de Drakterima D&D 5e homebrew").
- El encabezado debe permitir colocar una imagen de fondo como banner-background
- Las estadísticas deben mostrarse en un formato más compacto que el de la captura, ocupando no más de dos lineas.
- La sección "Última sesión" Debe llamarse en realidad "Sesiones", incluyendo en su sección tiles (en dos columnas) para "Última sesión" y "Próxima sesión" (Tomando la siguiente sesión registrada en calendario desde el día actual)
- Incluir secciones "PNJs Recientes" y "Últimos Artículos" (máximo 5 entradas) como se muestra en la captura"
