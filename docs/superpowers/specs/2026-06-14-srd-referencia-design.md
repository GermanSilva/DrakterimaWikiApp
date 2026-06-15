# SRD / Referencia — Diseño

**Fecha:** 2026-06-14
**Caso de uso principal:** Consulta rápida durante la sesión de juego (jugadores y DM).

---

## Objetivo

Agregar una sección "SRD / Reglas" a la app que consume la API pública de open5e (`https://api.open5e.com/v1/`) para consultar contenido de D&D 5e SRD sin salir de la wiki de campaña.

---

## Arquitectura

### Archivos nuevos

- **`src/pages/SRD.jsx`** — página principal. Maneja `activeTab` y `selectedItem` (detalle inline). Read-only: sin interacción con Firebase ni con `save`/`remove`.
- **`src/srd/srdApi.js`** — capa de acceso a la API. Una función por endpoint. Maneja URL building, fetch, paginación y errores.

### Archivos modificados

- **`src/components/Sidebar.jsx`** — nueva sección "Referencia" con ítem `{ id: 'srd', label: 'SRD / Reglas', icon: BookMarked }`. Visible para todos (no `dmOnly`). Sin `count`.
- **`src/App.jsx`** — agregar `'srd'` a `PAGES`.

---

## Secciones (pestañas)

Barra de pestañas horizontal arriba de la página, sin librerías externas:

| Pestaña | Endpoint | Filtros clave |
|---|---|---|
| Hechizos | `/v1/spells/` | nivel (0–9), escuela |
| Monstruos | `/v1/monsters/` | CR (rangos), tipo |
| Condiciones | `/v1/conditions/` | ninguno (carga completa al entrar) |
| Armas | `/v1/weapons/` | categoría (simple/marcial) |
| Armaduras | `/v1/armor/` | categoría (ligera/media/pesada) |
| Ítems mágicos | `/v1/magicitems/` | rareza |

---

## UI por pestaña

Cada pestaña (excepto Condiciones) tiene:

1. **Campo de búsqueda** por nombre con debounce 400 ms
2. **1-2 selects de filtro** específicos por sección (ver tabla arriba)
3. **Lista de resultados** en cards minimalistas (nombre + dato clave)
4. **Botón "Ver más"** al pie — carga la siguiente página (20 resultados por request)
5. **Detalle inline** al hacer click en un ítem: vista de detalle con botón "← Volver", mismo patrón que el resto de la app (`selectedItem` state)

**Condiciones:** no tiene buscador, carga los ~15 ítems de una sola vez al montar.

---

## Estado local por pestaña

Cada pestaña gestiona su propio estado React:
- `results` — array acumulado de ítems
- `loading` — boolean
- `error` — string | null
- `page` — URL de la página siguiente (`next` de la API)
- `filters` — objeto con los valores actuales de búsqueda y filtros

Al cambiar de pestaña, el estado se resetea. No hay caché entre pestañas ni en Firebase.

---

## srdApi.js — interfaz pública

```js
fetchSpells({ search, level, school, pageUrl })   // → { results, next }
fetchMonsters({ search, cr, type, pageUrl })       // → { results, next }
fetchConditions()                                   // → { results }
fetchWeapons({ search, category, pageUrl })        // → { results, next }
fetchArmors({ search, category, pageUrl })         // → { results, next }
fetchMagicItems({ search, rarity, pageUrl })       // → { results, next }
```

- Si `pageUrl` está presente, fetchea esa URL directamente (paginación).
- Todos retornan `{ results, next }` donde `next` es la URL completa de la página siguiente o `null`.
- En caso de error de red: lanza excepción que la pestaña captura y muestra inline.

---

## Campos en detalle inline

**Hechizos:** nombre, nivel, escuela, tiempo de lanzamiento, alcance, componentes, duración, descripción, clases que lo usan.

**Monstruos:** tipo, tamaño, CR, AC, HP, velocidades, stats (STR/DEX/CON/INT/WIS/CHA), acciones especiales, descripción.

**Condiciones:** nombre + descripción completa.

**Armas:** daño, tipo de daño, propiedades, peso, precio.

**Armaduras:** CA base, categoría, req. de fuerza, desventaja en sigilo, precio.

**Ítems mágicos:** rareza, tipo, sintonía requerida, descripción completa.

---

## Errores

- Si la API falla: mensaje de error inline dentro de la pestaña afectada. Sin toast global.
- Si no hay resultados: mensaje "Sin resultados para [búsqueda]".
- No hay reintentos automáticos — el usuario puede modificar la búsqueda o recargar.

---

## Restricciones

- **Sin WikiText ni wiki-links** — el contenido SRD se renderiza como texto plano (párrafos con saltos de línea). No es contenido de campaña.
- **Sin `isDM` guard** — la sección es visible para todos los usuarios.
- **Sin persistencia** — ningún dato del SRD se guarda en Firebase ni en localStorage.
- **Sin SSR/cache** — fetch en tiempo real por cada búsqueda. Suficiente para el caso de uso de sesión.

---

## Fuera de alcance

- Favoritos o marcadores de ítems SRD
- Integración de ítems SRD con la colección local de ítems de campaña
- Filtros adicionales más allá de los 1-2 por sección definidos arriba
- Soporte offline para el SRD
