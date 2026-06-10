# Diseño: Tipos de artículo en Sesiones, ordenamiento personalizado y filtros

**Fecha:** 2026-06-10  
**Estado:** Aprobado

---

## Resumen

Ampliar la sección "Sesiones" para soportar dos tipos de artículos: **Sesiones** (crónica de partida) y **Avances** (teasers narrativos breves). Agregar un campo `orden` float para posicionamiento manual en la línea de tiempo, filtros por tipo, y botones de navegación prev/next en la vista de detalle.

---

## 1. Modelo de datos

### Campo `tipo`

Todas las entradas de la colección `sesiones` en Firestore tienen ahora un campo:

```
tipo: 'sesion' | 'avance'
```

Las entradas sin `tipo` se tratan como `'sesion'` (retrocompatibilidad).

### Campo `orden`

Todas las entradas tienen:

```
orden: number  // float, determina posición en la línea de tiempo
```

Retrocompatibilidad: si una entrada no tiene `orden`, el sort usa `numero * 100` como fallback. Las sesiones del seed se guardan con `orden = numero * 100`.

### Estructura completa: Sesión

```js
{
  tipo: 'sesion',
  orden: 100,
  numero: 1,
  fecha: '',
  titulo: '',
  resumen: '',
  logros: '',
  ganchos: '',        // privado DM
  imagen_url: '',
  estado: 'publicado',
  visibilidad: []
}
```

### Estructura completa: Avance

```js
{
  tipo: 'avance',
  orden: 150,
  titulo: '',
  texto: '',          // cuerpo principal — único campo de contenido
  notas: '',          // privado DM
  imagen_url: '',
  estado: 'publicado',
  visibilidad: []
}
```

Las notas de jugador usan el componente `PlayerNotes` existente (entityType `'sesiones'`, entityId = id del avance).

---

## 2. Ordenamiento — campo `orden` con inserción por punto medio

### Sort en App.jsx

```js
if (collName === 'sesiones')
  docs.sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
```

### Cálculo de `orden` al guardar

Dado el artículo de referencia elegido en el dropdown:

| Situación | Cálculo |
|---|---|
| Sin artículos aún | `orden = 100` |
| Al principio (antes del primero) | `orden = primerArticulo.orden - 100` |
| Después del artículo X, X es el último | `orden = X.orden + 100` |
| Después del artículo X, hay un siguiente | `orden = (X.orden + siguiente.orden) / 2` |

La función `calcularOrden(afterId, allArticulos)` vive en `helpers.js`.

---

## 3. Formularios

### Campo de posición (compartido)

Selector `<select>` en ambos formularios con label "Posición en la línea de tiempo":

- Opción `(Al principio)` con value `'__first__'`
- Opciones: todos los artículos ordenados por `orden`, excluyendo el artículo actual al editar
- Texto de cada opción: `[Sesión N] Título` o `[Avance] Título`
- Default al crear: último artículo de la lista

El formulario guarda `afterId` como estado local; al hacer save, llama `calcularOrden` y pasa el `orden` resultante al objeto guardado.

### SesionForm

Campos actuales sin cambios. Se agrega el selector de posición antes de `EstadoField`.

### AvanceForm (nuevo)

Campos:
1. Título
2. Texto (textarea grande, WikiText-compatible, activa WikiLinkPicker)
3. Imagen (URL externa con preview)
4. Notas DM (textarea, privado — igual que `ganchos` en sesiones)
5. Selector de posición
6. `EstadoField`

### Botones de creación (header de página, solo DM)

`+ Nueva Sesión` (existente) · `+ Nuevo Avance` (nuevo).

`+ Nuevo Avance` llama `openForm('avances')`. `'avances'` es un **pseudo-tipo de formulario**: `FORM_COMPONENTS.avances = AvanceForm` y `FORM_TITLES.avances = ['Nuevo Avance', 'Editar Avance']`, pero `AvanceForm` siempre escribe a la colección `'sesiones'` de Firestore (igual que `SesionForm`). El botón Eliminar en `AvanceForm` también llama `remove('sesiones', item.id)`.

Cuando el DM edita un avance existente, el botón Editar en el detalle llama `openForm('avances', sesion.id)` en lugar de `openForm('sesiones', sesion.id)`.

---

## 4. Vista de lista (timeline)

### Filtros

Tabs encima de la lista:

```
[Todos]  [Sesiones]  [Avances]
```

Estado local `tipoFilter: 'todos' | 'sesion' | 'avance'` en `Sesiones()`. Default `'todos'`. El filtro se aplica sobre la lista ya filtrada por `isVisible`.

### Distinción visual en las cards

| Elemento | Sesión | Avance |
|---|---|---|
| Marcador timeline | Cuadrado relleno / vacío (estado actual) | Rombo (◆) |
| Eyebrow | `Sesión N · fecha` | `Avance · fecha` (si tiene) |
| Título | Uppercase, peso normal | Uppercase, *itálica* o color ligeramente diferente |
| Preview de texto | `plainText(resumen)` | `plainText(texto)` |

---

## 5. Vista de detalle

### SesionDetailInline — renderizado según `tipo`

El componente recibe `sesion` (que puede ser sesión o avance). Rama por `sesion.tipo`:

- `'sesion'`: layout actual sin cambios
- `'avance'`: título + sección de texto (`WikiText`), imagen, sección DM con `notas`, `PlayerNotes`

### Botones prev/next

En la barra sticky del detalle, a la derecha del botón Editar:

```
[← Anterior]  [Siguiente →]
```

El componente padre `Sesiones()` calcula:

```js
const visibleList = sortedAll.filter(s => isVisible(s, isDM, currentPlayer))
const idx = visibleList.findIndex(s => s.id === selectedId)
const prevId = idx > 0 ? visibleList[idx - 1].id : null
const nextId = idx < visibleList.length - 1 ? visibleList[idx + 1].id : null
```

Pasa `prevId`, `nextId` y `onNavigate(id)` como props a `SesionDetailInline`. Botones deshabilitados (o no renderizados) cuando el id correspondiente es null.

La lista `sortedAll` usa **todos** los artículos visibles para el usuario — independiente del `tipoFilter` activo en la lista. Esto asegura que prev/next navega la secuencia completa, no el subconjunto filtrado.

---

## 6. Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/App.jsx` | Sort por `orden`; `openForm` acepta `defaults`; `saveGameResult` no cambia |
| `src/helpers.js` | Nueva función `calcularOrden(afterId, allArticulos)` |
| `src/seed.js` | Agrega `tipo: 'sesion'` y `orden: numero * 100` a `seedSesiones` |
| `src/components/FormModal.jsx` | `SesionForm` + selector posición; nuevo `AvanceForm`; nuevo título en `FORM_TITLES`/`FORM_COMPONENTS` |
| `src/pages/Sesiones.jsx` | Tabs de filtro; distinción visual en cards; rama `tipo` en detalle; props prev/next/onNavigate |
