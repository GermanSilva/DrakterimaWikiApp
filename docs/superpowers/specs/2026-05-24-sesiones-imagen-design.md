# Diseño: Imagen en Sesiones

**Fecha:** 2026-05-24

## Resumen

Agregar soporte de `imagen_url` a las sesiones, siguiendo el patrón ya establecido en PNJs, Lugares, Facciones e Ítems. La imagen aparece en tres lugares: el formulario de edición, la vista de detalle, y como thumbnail en la lista de sesiones.

## Archivos a modificar

### 1. `src/components/FormModal.jsx` — `SesionForm`

- Agregar `imagen_url: item?.imagen_url ?? ''` al estado inicial del formulario.
- Agregar un `FormGroup` con:
  - `<label>` "Imagen (URL externa)"
  - `<input type="url">` con placeholder `https://i.imgur.com/...`
  - Preview inline: `<img>` condicional a `f.imagen_url`, `max-h-[140px]`, `onError` para ocultarla si la URL falla.
- Incluir `imagen_url` en el objeto pasado a `save()`.

### 2. `src/pages/Sesiones.jsx` — `SesionDetailInline`

Modificar el bloque del encabezado (número/fecha/título) para mostrar la imagen a la derecha:

- Envolver el encabezado actual en `<div className="flex w-full gap-4">`.
- El contenido textual (número, fecha, título) queda en `<div className="flex-1 ...">`.
- A continuación, condicional a `sesion.imagen_url`, agregar la imagen:
  ```jsx
  {sesion.imagen_url && (
    <div className="my-4">
      <img src={sesion.imagen_url} alt={sesion.titulo}
        className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base"
        onError={e => e.target.style.display = 'none'} />
    </div>
  )}
  ```

### 3. `src/pages/Sesiones.jsx` — lista de sesiones

Modificar cada item del listado para mostrar un thumbnail a la izquierda:

- Envolver el item en `<div className="flex gap-3 ...">`.
- Bloque izquierdo (fijo, siempre presente para mantener alineación):
  ```jsx
  <div className="w-32 shrink-0 self-stretch bg-bg-mid overflow-hidden">
    {s.imagen_url
      ? <img src={s.imagen_url} alt={s.titulo}
          className="w-full h-full object-cover"
          onError={e => e.target.style.display = 'none'} />
      : null}
  </div>
  ```
- Bloque derecho: contenido textual existente en `<div className="flex-1 min-w-0">`.

**Decisiones de diseño:**
- Ancho fijo `w-32` (128px) para todas las entradas, con o sin imagen, para mantener alineación consistente.
- `object-cover` con `h-full` aprovecha el formato apaisado (landscape) de las imágenes.
- El dot/timeline marker (`.absolute.left-[-21px]`) se mantiene en su posición actual, exterior al flex row.

## Lo que NO cambia

- El timeline marker (`.absolute.left-[-21px]`) sigue en el mismo lugar.
- El campo `imagen_url` es opcional; sesiones sin imagen se ven igual que hoy, salvo el espacio reservado en la lista.
- No se modifica `seed.js` ni el esquema de Firestore (el campo es simplemente ignorado si está ausente).
