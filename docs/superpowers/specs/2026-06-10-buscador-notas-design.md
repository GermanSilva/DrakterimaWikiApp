# Buscador de notas — Diseño

**Fecha:** 2026-06-10
**Feature:** Buscador en la página Notas con sintaxis `[sección]` + texto libre
**Scope:** `src/pages/Notas.jsx` únicamente

---

## Objetivo

Agregar un buscador a la sección de Notas que permita filtrar por título de artículo, sección (tipo de entidad) y contenido de la nota. Soporta sintaxis `[sección]` para filtrar por tipo específico combinado con texto libre.

---

## Arquitectura

Todo el cambio ocurre dentro de `Notas.jsx`. No se toca `PlayerNotes.jsx` ni ningún otro archivo.

Piezas nuevas:
- Estado `query` (string, vacío por defecto)
- Función pura `parseQuery(q)` → `{ sectionFilter: string|null, textFilter: string }`
- Función pura `filterNotes(notes, parsed, db)` → notas filtradas
- Componente interno `SearchBar` (input + chips)

---

## Parseo de la query (`parseQuery`)

Extrae el primer bloque `[...]` de la string como filtro de sección; el resto es texto libre.

| Query | sectionFilter | textFilter |
|---|---|---|
| `[lugar] kardevir` | `"lugar"` | `"kardevir"` |
| `kardevir` | `null` | `"kardevir"` |
| `[ses]` | `"ses"` | `""` |
| `[faccion] torre` | `"faccion"` | `"torre"` |

Solo se procesa el primer bloque `[...]`. El texto libre es todo lo que queda tras eliminar el bloque `[...]` de la query (puede estar antes o después del bloque).

---

## Lógica de filtrado (`filterNotes`)

### Normalización
Todas las comparaciones se hacen con una función `normalize(s)` que:
1. Convierte a minúsculas
2. Elimina diacríticos (acentos) via `NFD` + regex

Esto permite que `[faccion]` matchee "Facción" y `[sesion]` matchee "Sesión".

### Cuando `sectionFilter` no es null
Una nota pasa el filtro de sección si `normalize(TYPE_LABELS[note.type])` o `normalize(note.type)` contiene `normalize(sectionFilter)`.

Ejemplos: `[ses]` matchea "Sesión" y "sesiones"; `[pnj]` matchea "PNJ" y "pnjs".

### Cuando `textFilter` no es vacío
Una nota pasa el filtro de texto si alguno de estos campos contiene `normalize(textFilter)`:
- Título del artículo: `entityName(db, note.type, note.entity_id)`
- Contenido de la nota: `note.text`
- Label de sección: `TYPE_LABELS[note.type]` — **solo cuando `sectionFilter` es null** (si ya se filtró por sección, no tiene sentido re-buscar en ese campo)

### Ambos presentes
Se aplican ambos filtros como AND: una nota debe pasar sección Y texto.

---

## Componente `SearchBar`

### Input
- Placeholder: `"Buscar… o [sección] texto"`
- Input de ancho completo, estilo consistente con `inputCls` de `constants.js`
- Icono `Search` de lucide-react a la izquierda dentro del input

### Chips de sección
- Aparecen debajo del input
- Muestran las secciones presentes en las notas visibles para el usuario actual:
  - DM: notas del PJ seleccionado (o todas si filtro = "Todas"), antes de aplicar filtro de texto
  - Jugador: sus propias notas, antes de filtro de texto
- Los chips son estables mientras se escribe (no desaparecen al filtrar)
- Cada chip muestra el label corto: `Sesión`, `Lugar`, `PNJ`, etc.
- Al hacer click, inserta la forma normalizada entre corchetes en el input: `[sesion]`, `[lugar]`, `[pnj]`, `[faccion]`, `[lore]`, `[item]`, `[pj]`
- Si el input ya contiene un `[...]`, el click lo **reemplaza**
- Hacer click en el chip **activo** (su `[xxx]` ya está en el input) quita el bloque `[...]` del input (toggle)
- Estilo de chip activo: igual al filtro de PJ activo (`border-accent bg-accent/10 text-txt-primary`)

### Mapa chip → valor insertado
| Label chip | Valor insertado |
|---|---|
| Sesión | `[sesion]` |
| PJ | `[pj]` |
| PNJ | `[pnj]` |
| Lugar | `[lugar]` |
| Facción | `[faccion]` |
| Lore | `[lore]` |
| Ítem | `[item]` |

---

## Integración por vista

### Vista DM
1. Filtro por PJ (existente) se aplica primero
2. Luego `filterNotes` se aplica al resultado
3. Si un grupo de PJ queda sin notas tras el filtro de texto, ese grupo no se renderiza
4. Los chips muestran secciones del set de notas post-filtro-PJ, pre-filtro-texto

### Vista jugador
1. `filterNotes` se aplica directamente sobre `myNotes`
2. Los chips muestran secciones presentes en todas sus notas (pre-filtro-texto)

---

## Empty state con búsqueda activa

Cuando `query.trim()` no está vacío y no hay resultados: mostrar `"No hay notas que coincidan con «{query}»."` en lugar del mensaje estático habitual.

---

## Lo que NO se hace

- No se resaltan (highlight) los términos encontrados en el texto de la nota
- No se modifica `PlayerNotes.jsx`
- No se agrega búsqueda en otras páginas
