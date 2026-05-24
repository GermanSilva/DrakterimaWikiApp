---
title: Lightbox de imágenes en vistas de detalle
date: 2026-05-24
status: approved
---

## Objetivo

Al hacer click en la imagen de cualquier artículo en vista de detalle, abrirla en un modal de pantalla completa.

## Componente nuevo

### `src/components/ImageLightbox.jsx`

Props: `src` (string), `alt` (string), `onClose` (fn).

- Overlay: `fixed inset-0 bg-black/[.88] z-[400] flex items-center justify-center backdrop-blur-sm`
- Click en el overlay cierra el modal
- Tecla `Escape` cierra el modal (keydown listener en `useEffect`)
- Imagen: `max-w-[92vw] max-h-[88vh] object-contain`

## Cambios en páginas de detalle

Patrón aplicado en: `PNJs`, `Lugares`, `Facciones`, `Items`, `PJDetail`.

1. Agregar `const [lightbox, setLightbox] = useState(false)`
2. Al `<img>` existente: añadir `cursor-zoom-in` y `onClick={() => setLightbox(true)}`
3. Al final del componente: `{lightbox && <ImageLightbox src={entity.imagen_url} alt={entity.nombre} onClose={() => setLightbox(false)} />}`

## Refactor de Sesiones

`Sesiones.jsx` ya tiene el lightbox inline. Se reemplaza por `<ImageLightbox>` y se elimina el código inline de overlay.

## No incluido

- No hay navegación entre imágenes.
- No se agrega lightbox en cards de lista (solo vistas de detalle).
- No se modifica el comportamiento de `onError`.
