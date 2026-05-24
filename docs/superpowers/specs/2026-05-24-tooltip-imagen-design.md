---
title: Tooltip con miniatura de imagen
date: 2026-05-24
status: approved
---

## Objetivo

Mostrar una miniatura de la entidad en el tooltip de wiki-links cuando la entidad tiene `imagen_url`.

## Archivos afectados

- `src/components/WikiLink.jsx` — extrae `entity.imagen_url` y lo pasa a `Tooltip`
- `src/components/Tooltip.jsx` — acepta prop `imagenUrl`, cambia layout a `flex-row` cuando existe

## Diseño

### WikiLink.jsx

Pasar `entity.imagen_url` como prop `imagenUrl` al componente `Tooltip`:

```jsx
<Tooltip title={title} section={section} imagenUrl={entity.imagen_url} />
```

### Tooltip.jsx

- Nueva prop: `imagenUrl` (string | undefined)
- Sin imagen: layout igual al actual (`flex-col`)
- Con imagen:
  - Contenedor raíz: `flex flex-row gap-2.5 items-start`
  - `max-w-[240px]` (era `max-w-[200px]`)
  - Imagen: `<img>` con `object-cover rounded-sm max-h-[72px] max-w-[72px]`
  - `onError`: oculta la imagen con `e.currentTarget.style.display = 'none'`
  - Columna derecha: `flex flex-col gap-1.5` con título y tag (sin cambios)

## Comportamiento de error

Si la URL de imagen falla al cargar, `onError` oculta el elemento `<img>` y el tooltip queda en layout de fila con solo el texto a la derecha (degradación limpia).

## No incluido

- No se cambia el tamaño del tooltip en otros contextos.
- No se agrega lógica de caché ni lazy loading.
