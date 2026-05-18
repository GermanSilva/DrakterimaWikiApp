# Wiki-links con sufijo de sección

**Fecha:** 2026-05-17
**Estado:** Aprobado

## Resumen

Mejorar el sistema de wiki-links para que cada ID incluya una letra mayúscula al final que indique la colección destino. Formato nuevo estricto: `[[{3P}Texto]]`. El formato viejo `[[{3}Texto]]` se considera inválido y renderiza una etiqueta de error. Un botón de migración en Dashboard actualiza los datos existentes automáticamente.

## Mapeo de letras

| Colección | Letra |
|-----------|-------|
| Sesiones  | `S`   |
| PJs       | `P`   |
| PNJs      | `N`   |
| Lugares   | `G`   |
| Facciones | `F`   |
| Lore      | `L`   |
| Items     | `I`   |

El mapa `COLLECTION_LETTER` vive en `WikiText.jsx` como fuente de verdad y es importado por los badges de ID en las páginas de detalle.

## Componentes

### WikiText.jsx (modificado)
- Regex actualizado: `/\[\[\{(\d+)([A-Z])\}([^\]]*)\]\]/g` — número + letra mayúscula obligatoria.
- Formato inválido (ej. `{3}` sin letra): renderiza `<span>[[ID incorrecto]]</span>` con estilo atenuado.
- Formato válido pero ID no existe en la colección indicada: renderiza link roto con estilo existente.
- Delega cada enlace válido al componente `WikiLink`.
- Solo responsabilidad: parsear y distribuir segmentos.

### WikiLink.jsx (nuevo, `src/components/WikiLink.jsx`)
- Props: `{ id, letter, displayText, entity, page }`
- Maneja hover state con `useState`.
- Renderiza el texto del enlace + `Tooltip` al hacer hover.
- Responsabilidad única: representar un enlace individual con su estado interactivo.

### Tooltip.jsx (nuevo, `src/components/Tooltip.jsx`)
- Props: `{ children, title, section }`
- Posicionado con CSS: wrapper `position: relative`, tooltip `position: absolute`.
- Contenido: nombre del artículo en texto + tag de sección usando el componente `Tag` existente.
- Sin librerías externas. Estilo coherente con el tema oscuro de la app (CSS custom properties).
- Responsabilidad única: mostrar información contextual al hover.

### Badges de ID en páginas de detalle (modificado)
- Todas las páginas (`PJs.jsx`, `PNJs.jsx`, `Sesiones.jsx`, `Lugares.jsx`, `Facciones.jsx`, `Lore.jsx`, `Items.jsx`).
- El badge pasa de mostrar `{3}` a `{3P}` importando `COLLECTION_LETTER` desde `WikiText.jsx`.

### Dashboard.jsx (modificado)
- Botón "Migrar wiki-links", visible solo para DM.
- Al hacer click: escanea todos los campos de texto largo de cada colección, reemplaza `[[{N}texto]]` → `[[{NL}texto]]` usando `findEntity` para determinar la letra.
- Si un ID no se encuentra en ninguna colección: el link se deja sin cambiar y se loguea en consola.
- Escribe todos los documentos modificados con `writeBatch`.
- Toast al finalizar: "X enlaces migrados. Y no pudieron resolverse."

## Campos de texto largo a escanear en migración

| Colección  | Campos                          |
|------------|---------------------------------|
| sesiones   | `resumen`, `secreto`            |
| pjs        | `trasfondo`, `notas`            |
| pnjs       | `descripcion`, `notas`          |
| lugares    | `descripcion`, `notas`          |
| facciones  | `descripcion`, `notas`          |
| lore       | `contenido`, `notas`            |
| items      | `descripcion`, `notas`          |

## Flujo de migración

1. DM hace click en "Migrar wiki-links".
2. Se recorren todos los documentos de todas las colecciones.
3. Para cada campo de texto: se buscan matches de `[[{N}texto]]` (sin letra).
4. Para cada match: se llama a `findEntity(db, N)` para obtener la colección → se construye la letra → se reemplaza.
5. Si `findEntity` no encuentra el ID: se deja el link sin cambiar, se registra en consola.
6. `writeBatch` con todos los documentos que tuvieron al menos un reemplazo.
7. Toast con conteo de éxitos y fallos.

## Principios aplicados

- **Clean architecture**: parseo (WikiText), interacción (WikiLink), presentación (Tooltip) separados. Cada componente tiene una única responsabilidad.
- **Fuente de verdad única**: `COLLECTION_LETTER` definido una sola vez, importado donde se necesita.
- **Sin breaking changes en UX**: la migración es automática con un click; el DM no necesita editar nada a mano.
