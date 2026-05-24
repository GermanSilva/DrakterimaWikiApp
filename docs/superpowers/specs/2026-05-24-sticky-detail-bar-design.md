---
title: Barra de acciones sticky en vistas de detalle
date: 2026-05-24
status: approved
---

## Objetivo

La barra "← Volver / Editar" en las vistas de detalle de todas las secciones debe permanecer visible al hacer scroll, pegada debajo del header fijo.

## Contexto

- El `Header` es `position: fixed; top: 0; height: 60px`.
- El `main` tiene `px-10 py-8` (mobile: `p-5`).
- La barra aparece en 7 componentes de detalle.

## Cambio

En cada componente de detalle, el div contenedor del bar pasa de:

```jsx
<div className="flex justify-between mb-7">
```

a:

```jsx
<div className="flex justify-between mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
```

### Clases añadidas

| Clase | Propósito |
|---|---|
| `sticky top-[60px]` | Pega el bar justo debajo del header fijo |
| `z-10` | Asegura que quede por encima del contenido al hacer scroll |
| `bg-[#060606]` | Fondo sólido que tapa el contenido que pasa por debajo |
| `py-3` | Espaciado vertical cuando el bar está pegado |
| `-mx-10 px-10` | Extiende el fondo al ancho completo del main (desktop) |
| `max-md:-mx-5 max-md:px-5` | Idem para mobile (padding del main es `p-5`) |

## Archivos afectados

1. `src/pages/PNJs.jsx` — `PNJDetailInline`
2. `src/pages/Lugares.jsx` — `LugarDetailInline`
3. `src/pages/Facciones.jsx` — `FaccionDetailInline`
4. `src/pages/Lore.jsx` — `LoreDetailInline`
5. `src/pages/Items.jsx` — componente de detalle inline
6. `src/pages/Sesiones.jsx` — componente de detalle inline
7. `src/pages/pj/PJDetail.jsx`

## No incluido

- No se extrae un componente `DetailBar` compartido.
- No se modifica el comportamiento de los botones.
