# SRD Raw Data Viewer (DM)

## Objetivo

En la vista de detalle de cada entrada del SRD, mostrar un botón (solo visible para el DM) que permita ver el JSON raw tal como fue retornado por la API de open5e.

## Componente: `RawDataSection`

**Ubicación:** `src/srd/srdCommon.jsx` (exportado junto a `SRDDetailHeader` y `SRDList`)

**Props:** `data` (object) — el objeto completo de la entidad tal como vino de la API.

**Comportamiento:**
- Lee `isDM` de `useApp()`; retorna `null` si no es DM.
- Estado interno `open` (default `false`).
- Botón toggle: `{ } Ver datos raw` / `{ } Ocultar datos raw`, usando `btnSecondary`.
- Cuando `open === true`, renderiza `<pre>` con `JSON.stringify(data, null, 2)` y `overflow-x: auto` para JSONs anchos.
- Separado del contenido anterior con un margen top.

## Integración

Agregar `<RawDataSection data={xxx} />` como último elemento dentro del `<div>` raíz de cada Detail:

| Archivo | Component | Prop |
|---|---|---|
| `SpellsTab.jsx` | `SpellDetail` | `data={spell}` |
| `MonstersTab.jsx` | `MonsterDetail` | `data={monster}` |
| `ConditionsTab.jsx` | `ConditionDetail` | `data={condition}` |
| `WeaponsTab.jsx` | `WeaponDetail` | `data={weapon}` |
| `ArmorsTab.jsx` | `ArmorDetail` | `data={armor}` |
| `MagicItemsTab.jsx` | `MagicItemDetail` | `data={item}` |

## Lo que NO cambia

- Sin rutas nuevas.
- Sin estado global ni Firebase.
- Sin cambios en la API o en `srdApi.js`.
- Los jugadores no ven el botón (guard `isDM`).
