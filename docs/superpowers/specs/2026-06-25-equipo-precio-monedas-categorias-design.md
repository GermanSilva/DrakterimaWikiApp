# Diseño: Precio en items de equipo + Categorías de monedas en PJ

**Fecha:** 2026-06-25
**Estado:** Aprobado

## Resumen

Dos mejoras al inventario de PJ:
1. Agregar precio (valor numérico + moneda) a cada ítem de equipo, con totalizador automático del inventario.
2. Dividir el registro de monedas en dos categorías independientes: "En mano" y "Guardadas".

---

## Feature 1 — Precio en items de equipo

### Schema

Dos campos opcionales nuevos en cada entrada de `pj.equipo[]` (retrocompatibles — valores por defecto si ausentes):

```js
precio: number        // default 0; precio unitario del ítem
precio_moneda: string // 'cp'|'sp'|'ep'|'gp'|'pp'; default 'gp'
```

### `EquipmentCRUD.jsx`

El `EMPTY` base pasa a ser:
```js
const EMPTY = { nombre: '', cantidad: 1, descripcion: '', precio: 0, precio_moneda: 'gp' }
```

En el inline form se agrega una fila con input numérico de `precio` y `<select>` de `precio_moneda`, al lado de Cantidad:

```
[ Nombre ] [ Cantidad ] [ Precio ] [ ¤ moneda ▾ ]
[ Descripción                                    ]
```

El `confirm()` parsea `parseInt(draft.precio) || 0` igual que `cantidad`.

### `PJEquipmentSection.jsx`

- Cada ítem muestra el precio cuando `precio > 0`: `"5 gp"` alineado a la derecha.
- Al final de la lista (si al menos un ítem tiene precio): totalizador que convierte todos los precios × cantidad a cobre y los muestra en la denominación más alta posible.

**Tasas de conversión D&D 5e:**
- 1 pp = 1000 cp
- 1 gp = 100 cp
- 1 ep = 50 cp
- 1 sp = 10 cp
- 1 cp = 1 cp

**Formato del totalizador:** descompone el total en cp en pp/gp/sp/cp mostrando solo las denominaciones no-cero. Ej: `"Valor total: 12 gp 3 sp"`.

---

## Feature 2 — Categorías de monedas (En mano / Guardadas)

### Schema

Backwards-compatible: `pj.monedas` existente se trata como "En mano". Se agrega `pj.monedas_guardado` como campo nuevo.

```js
pj.monedas          // { cp, sp, ep, gp, pp } — "En mano" (campo existente, sin cambios)
pj.monedas_guardado // { cp, sp, ep, gp, pp } — "Guardadas" (campo nuevo, opcional)
```

Los PJs existentes no requieren migración: sus datos quedan automáticamente como "En mano".

### `EquipmentCRUD.jsx`

La sección de monedas se divide en dos grupos con label propio:

```
MONEDAS EN MANO
[ CP ][ SP ][ EP ][ GP ][ PP ]

MONEDAS GUARDADAS
[ CP ][ SP ][ EP ][ GP ][ PP ]
```

`onMonedasChange` sigue manejando `pj.monedas`. Se agrega prop `onMonedasGuardadoChange` que maneja `pj.monedas_guardado`.

### `PJInventoryTab.jsx`

Pasar las nuevas props `monedas_guardado` y `onMonedasGuardadoChange` a `EquipmentCRUD`.

### `PJEquipmentSection.jsx`

Muestra ambas categorías con subtítulos separados. No se muestra total combinado de monedas (más claro para el jugador distinguir cuánto lleva encima vs. en banco).

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/pj/form/EquipmentCRUD.jsx` | Precio en form + split monedas en dos grupos |
| `src/pages/pj/form/PJInventoryTab.jsx` | Pasar props de `monedas_guardado` |
| `src/pages/pj/detail/PJEquipmentSection.jsx` | Mostrar precio por ítem + totalizador + dos secciones de monedas |
| `CLAUDE.md` | Actualizar schema de equipo y monedas |

No se tocan: `seed.js`, `App.jsx`, `helpers.js` — los cambios son retrocompatibles y no requieren nuevas colecciones ni lógica de visibilidad.
