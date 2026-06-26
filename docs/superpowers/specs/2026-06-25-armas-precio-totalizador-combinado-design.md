# Diseño: Precio en armas + totalizador combinado (equipo + armas)

**Fecha:** 2026-06-25
**Estado:** Aprobado

## Resumen

Dos cambios relacionados:
1. Agregar precio (valor numérico + moneda) a cada arma/ataque del PJ.
2. El totalizador de `PJEquipmentSection` pasa a sumar equipo + armas, reflejando que las armas también son objetos del inventario físico del personaje.

---

## Feature 1 — Precio en armas (`pj.ataques[]`)

### Schema

Dos campos opcionales nuevos en cada entrada de `pj.ataques[]` (retrocompatibles):

```js
precio: number        // default 0 — precio unitario del arma
precio_moneda: string // 'cp'|'sp'|'ep'|'gp'|'pp'; default 'gp'
```

### `AttacksCRUD.jsx`

`EMPTY` pasa a ser:
```js
const EMPTY = { nombre: '', bono_ataque: '', dano: '', tipo_dano: '', alcance: '', notas: '', precio: 0, precio_moneda: 'gp' }
```

El form inline (grid `grid-cols-2`) tiene actualmente 6 campos. Se agrega una fila de Precio con número + select de moneda (mismo patrón que EquipmentCRUD):

```
[ Arma        ] [ Bono Ataque ]
[ Daño        ] [ Tipo        ]
[ Alcance     ] [ Notas       ]
[ Precio + ¤  ]
```

La celda de Precio ocupa una columna, con input numérico y select de moneda en flex horizontal. El `startEdit(a)` usa `{ ...EMPTY, ...a }` para backfill de campos faltantes en ataques guardados antes de este schema.

En la tabla de lista (modo lectura dentro del form), se agrega una columna "Valor" al final (antes de los botones), mostrando `{precio} {moneda}` cuando `parseInt(precio) > 0`.

### `PJAttacksSection.jsx`

La tabla de detalle agrega columna "Valor" al final (antes de Notas). Muestra `{precio} {moneda}` cuando `parseInt(precio) > 0`. Las filas sin precio simplemente muestran celda vacía.

---

## Feature 2 — Totalizador combinado en `PJEquipmentSection`

### Cambio

`calcTotalCP` actualmente solo recibe `equipo`. Pasa a recibir `equipo` y `ataques` y suma ambos.

`PJEquipmentSection` ya recibe `pj` como prop, así que `pj.ataques ?? []` es accesible sin cambios de interfaz.

El label del totalizador cambia de `"Valor total:"` a `"Valor total del inventario:"`.

### Tasas de conversión

Sin cambios: 1pp=1000cp, 1gp=100cp, 1ep=50cp, 1sp=10cp.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/pj/form/AttacksCRUD.jsx` | Precio en form + columna Valor en tabla |
| `src/pages/pj/detail/PJAttacksSection.jsx` | Columna Valor en tabla de detalle |
| `src/pages/pj/detail/PJEquipmentSection.jsx` | `calcTotalCP` suma equipo + ataques; label actualizado |
| `CLAUDE.md` | Actualizar schema de ataques |

No se tocan: `PJInventoryTab`, `seed.js`, `App.jsx`.
