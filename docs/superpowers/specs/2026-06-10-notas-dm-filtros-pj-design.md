# Diseño: Filtros por PJ en vista de Notas (DM)

**Fecha:** 2026-06-10  
**Archivo afectado:** `src/pages/Notas.jsx`

## Objetivo

Agregar botones de filtro en la vista DM de la página Notas, permitiendo ver las notas de un PJ específico o todas juntas.

## Comportamiento actual

El DM ve todas las notas agrupadas por PJ, sin posibilidad de filtrar. Cada grupo muestra encabezado (nombre + jugador) y sus NoteCards.

## Comportamiento nuevo

### Barra de filtros

Aparece entre `PageHeader` y el listado de grupos, únicamente en la vista DM cuando hay al menos un grupo con notas.

Botones:
- **"Todas"**: muestra todos los grupos (comportamiento actual). Seleccionado por defecto.
- **Un botón por PJ**: solo para PJs que tengan al menos una nota activa. Etiqueta: `pj.nombre` (sin el jugador, para mantenerlo corto).

### Estado

```jsx
const [selectedPjId, setSelectedPjId] = useState(null)
// null = "Todas"
```

### Filtrado

```jsx
const displayed = selectedPjId === null
  ? grouped
  : grouped.filter(g => g.pj.id === selectedPjId)
```

### Layout de cada grupo filtrado

Idéntico al actual: encabezado con `NotebookPen` + nombre · jugador, seguido de las NoteCards. No se altera el layout al filtrar.

### Estilo de la barra de filtros

Botones compactos, estilo similar a los filtros de tipo en Sesiones. El botón activo usa borde `accent` y texto primario; los inactivos usan borde `border-base` y texto `txt-muted`.

## Alcance

- Solo `src/pages/Notas.jsx`.
- No se tocan: `PlayerNotes.jsx`, `AppContext.jsx`, `seed.js`, ni ningún otro archivo.
- No se agrega ninguna persistencia del filtro (estado local, se resetea al cambiar de página).

## Criterio de éxito

El DM puede hacer clic en el nombre de un PJ y ver solo sus notas con el mismo layout agrupado. "Todas" restaura la vista completa.
