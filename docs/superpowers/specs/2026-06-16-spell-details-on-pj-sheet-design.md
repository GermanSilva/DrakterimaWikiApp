# Diseño: Características y descripción de hechizos en ficha de PJ

**Fecha:** 2026-06-16  
**Estado:** Aprobado

## Resumen

Extender el sistema de hechizos en las fichas de personaje jugador (PJ) para que cada hechizo pueda almacenar sus características completas (tiempo de lanzamiento, alcance, componentes, duración, escuela, descripción, etc.) ingresadas manualmente por el DM. Los jugadores pueden ver esos detalles desde la ficha del PJ mediante un modal popup.

## Schema de datos

Cada entrada en `pj.hechizos` pasa de `{ id, nombre, nivel }` a:

```js
{
  id,
  nombre,                 // string
  nivel,                  // number 0–9
  preparado,              // boolean, default false
  escuela,                // string libre (Evocación, Conjuración, etc.)
  casting_time,           // string libre
  alcance,                // string libre
  componentes,            // string libre
  duracion,               // string libre
  concentracion,          // boolean
  ritual,                 // boolean
  descripcion,            // string (texto largo)
  a_niveles_superiores,   // string (texto largo, opcional)
}
```

**Migración:** ninguna. Los campos nuevos son opcionales; los hechizos existentes sin ellos siguen funcionando.

## Componentes afectados

### 1. `SpellsCRUD.jsx` — formulario extendido

Extiende el inline form existente con los campos nuevos, organizados en filas:

- **Fila 1:** `nombre` + `nivel` + `escuela`
- **Fila 2:** `casting_time` + `alcance` + `componentes` + `duracion`
- **Fila 3:** checkboxes `preparado` + `concentracion` + `ritual`
- **Fila 4:** textarea `descripcion`
- **Fila 5:** textarea `a_niveles_superiores` — colapsable con botón "+ A niveles superiores", visible solo si ya tiene contenido o si el usuario lo despliega

Los campos de las filas 2–5 son opcionales; si no se llenan, el hechizo sigue siendo válido.

### 2. `PJSpellsSection.jsx` — lista con indicadores visuales

Cada hechizo se renderiza como un chip cliqueable que abre el modal de detalle. La lógica de color del chip:

- **`preparado === true` o `nivel === 0` (Truco):** chip con fondo rojo (`bg-accent text-white`)
- **`preparado === false` (y nivel > 0):** chip sin cambio visual (mismo estilo actual)

Badges adicionales pequeños al costado derecho del chip (solo si aplica):
- `C` — concentración
- `R` — ritual

### 3. Nuevo `SpellDetailModal.jsx`

Modal overlay (mismo patrón que `ImageLightbox`): fondo oscuro semitransparente, cierre con Escape o click fuera del panel.

Estructura del contenido:
1. **Header:** nombre del hechizo + subtítulo `Nivel X · Escuela` (o `Truco · Escuela`)
2. **Grid de características** (solo muestra las que tienen valor): casting_time, alcance, componentes, duración, concentración, ritual, preparado
3. **Descripción** (si existe)
4. **A niveles superiores** (si existe)

El modal no tiene acciones — es read-only.

## Flujo de uso

1. DM abre el formulario de un PJ → pestaña "Mecánicas" → sección Hechizos
2. Click "+ Agregar hechizo" → inline form con todos los campos nuevos
3. Guarda → el hechizo se almacena con los campos completados en Firestore vía `save('pjs', ...)`
4. En la ficha del PJ (vista detalle), sección Hechizos: chips de hechizos con color rojo si preparado/truco
5. Click en un chip → `SpellDetailModal` muestra todos los detalles

## Archivos a crear/modificar

| Archivo | Cambio |
|---|---|
| `src/pages/pj/form/SpellsCRUD.jsx` | Extender inline form con nuevos campos |
| `src/pages/pj/detail/PJSpellsSection.jsx` | Chips clicables + lógica de color + badges C/R |
| `src/pages/pj/detail/SpellDetailModal.jsx` | Nuevo componente modal read-only |

## Decisiones de diseño

- **Sin conexión al SRD:** todos los campos son texto libre ingresado manualmente. No hay fetch a open5e.
- **Trucos siempre preparados:** `nivel === 0` implica chip rojo sin importar el valor de `preparado`.
- **Sin migración de datos:** campos opcionales, retrocompatible con hechizos existentes.
- **Modal read-only:** los detalles se ven pero no se editan desde el popup; la edición sigue siendo desde el formulario del PJ.
