# Diseño: Toggle "portando / guardado" en equipo y armas

**Fecha:** 2026-06-25
**Estado:** Aprobado

## Resumen

Agregar un campo booleano `portando` a cada ítem de `pj.equipo[]` y `pj.ataques[]` para indicar si el personaje lleva el objeto consigo o lo dejó guardado en otro lugar. El toggle es accionable directamente desde la lista (sin abrir el form de edición). En la vista de detalle, equipo y ataques se dividen en dos sublistas/grupos, cada uno con su propio subtotal. El totalizador global sigue sumando todo.

---

## Schema (retrocompatible)

Campo nuevo `portando: boolean` en cada entrada. Default implícito `true` — ítems existentes sin el campo se tratan como portados.

```js
// pj.equipo[]
{
  id,            // number
  nombre,        // string
  cantidad,      // number, default 1
  descripcion,   // string, opcional
  precio,        // number, default 0
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
  portando,      // boolean, default true — true = portando, false = guardado
}

// pj.ataques[]
{
  id,            // number
  nombre,        // string
  bono_ataque,   // string
  dano,          // string
  tipo_dano,     // string
  alcance,       // string
  notas,         // string, opcional
  precio,        // number, default 0
  precio_moneda, // 'cp'|'sp'|'ep'|'gp'|'pp', default 'gp'
  portando,      // boolean, default true
}
```

Sin cambios en `seed.js`, `App.jsx` ni schema de Firestore.

---

## EquipmentCRUD.jsx

### Toggle inline (sin modo edición)

En la fila de cada ítem (modo lectura), se agrega un checkbox simple antes de los botones ✎ / ✕:

```jsx
<input
  type="checkbox"
  checked={item.portando !== false}
  onChange={() => onChange(equipo.map(e => e.id === item.id ? { ...e, portando: !((e.portando ?? true)) } : e))}
/>
```

`item.portando !== false` asegura retrocompatibilidad: `undefined` y `true` ambos dan `true` (portando).

### Campo en form de edición

`EMPTY` pasa a incluir `portando: true`. En el inline form se agrega checkbox "Portando actualmente" al final del grid.

---

## AttacksCRUD.jsx

### Toggle inline (sin modo edición)

En cada fila de la tabla (modo lectura), se agrega una columna extra con un checkbox:

```jsx
<td>
  <input
    type="checkbox"
    checked={a.portando !== false}
    onChange={() => onChange(ataques.map(x => x.id === a.id ? { ...x, portando: !(x.portando ?? true) } : x))}
  />
</td>
```

La tabla pasa de 7 columnas a 8: agrega columna "Porta" (header) antes de los botones.

### Campo en form de edición

`EMPTY` incluye `portando: true`. El inline form agrega checkbox "Portando actualmente".

---

## PJEquipmentSection.jsx

La lista de equipo se divide en dos sublistas: "Portando" y "Guardado". El totalizador muestra tres líneas: subtotal portando, subtotal guardado, total global.

### Lógica de separación

```js
const portando = equipo.filter(i => i.portando !== false)
const guardado = equipo.filter(i => i.portando === false)
```

### `calcTotalCP` — sin cambios de firma

`calcTotalCP(equipo, ataques)` sigue aceptando los dos arrays. Para los subtotales se llama tres veces:

```js
const ataquesPortando = (pj.ataques ?? []).filter(a => a.portando !== false)
const ataquesGuardado = (pj.ataques ?? []).filter(a => a.portando === false)

const subtotalPortandoStr = formatTotalCP(calcTotalCP(portando, ataquesPortando))
const subtotalGuardadoStr = formatTotalCP(calcTotalCP(guardado, ataquesGuardado))
const totalStr = formatTotalCP(calcTotalCP(equipo, pj.ataques ?? []))
```

### Layout de la sección

```
Equipo

  PORTANDO
  • Espada larga          5 gp
  • Escudo                10 gp
  Subtotal: 15 gp

  GUARDADO
  • Armadura de placas    1500 gp
  Subtotal: 1500 gp

  Valor total del inventario: 1515 gp
```

- Si `portando` está vacío: no se renderiza la subsección "PORTANDO".
- Si `guardado` está vacío: no se renderiza la subsección "GUARDADO".
- Si solo hay una categoría, igual se muestra con su sublabel para que quede claro el estado.
- El total global siempre se muestra cuando hay al menos un ítem con precio.

---

## PJAttacksSection.jsx

La tabla única se divide en dos grupos con cabecera de sección (no tablas separadas). Cada grupo tiene su propio `<thead>` + `<tbody>` dentro de un único `<table>`, o bien dos tablas consecutivas con un `<div>` de separación.

Opción elegida: **dos bloques independientes** (más limpio con el diseño de sublists del equipo):

```
Ataques

  PORTANDO
  [ tabla: Arma / Bono / Daño / Tipo / Alcance / Notas / Valor ]

  GUARDADO
  [ tabla: Arma / Bono / Daño / Tipo / Alcance / Notas / Valor ]
```

- Si una categoría está vacía, su bloque no se renderiza.
- Sin subtotales propios en la sección de ataques — los subtotales se muestran en `PJEquipmentSection` (que ya suma ambos).

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/pj/form/EquipmentCRUD.jsx` | Toggle checkbox inline + campo en form |
| `src/pages/pj/form/AttacksCRUD.jsx` | Toggle checkbox inline en tabla (col nueva) + campo en form |
| `src/pages/pj/detail/PJEquipmentSection.jsx` | Dos sublistas + subtotales separados + total global |
| `src/pages/pj/detail/PJAttacksSection.jsx` | Dos bloques de tabla con cabeceras de sección |
| `CLAUDE.md` | Schema actualizado con campo `portando` |

No se tocan: `seed.js`, `App.jsx`, `PJInventoryTab.jsx`, `helpers.js`.
