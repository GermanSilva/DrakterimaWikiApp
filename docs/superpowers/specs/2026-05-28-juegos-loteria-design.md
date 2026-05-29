# Spec: Sección de Juegos — Lotería del Dado

**Fecha:** 2026-05-28  
**Estado:** Aprobado

---

## Resumen

Agregar una sección "Juegos" a la wiki de Drakterima. El primer juego es una **Lotería del Dado (d20)** configurable por el DM. Los jugadores tienen 1 tirada por día; sus ganancias van a sus propias monedas. El DM puede tirar ilimitado; sus ganancias van a un pozo compartido visible públicamente. El DM puede asignar el pozo a un PJ desde Zona DM.

---

## Modelo de datos

### Colección `game_logs`

Un documento por tirada. Se agrega a `COLLECTIONS` en App.jsx para onSnapshot.

```js
{
  id: '3_loteria_2026-05-28',   // jugadores: {pjId}_loteria_{YYYY-MM-DD}
                                 // DM: dm_loteria_{Date.now()}
  actorType: 'player' | 'dm',
  playerId: 3,                  // id numérico del PJ; null si DM
  game: 'loteria',
  date: '2026-05-28',           // YYYY-MM-DD para checks diarios
  timestamp: '2026-05-28T14:32:00.000Z',
  roll: 18,
  prize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
  prizeTarget: 'player' | 'pot'
}
```

No se seedea (comienza vacía).

### Documento `game_pot/current`

Pozo acumulado de las tiradas del DM. Se seedea con ceros si la colección está vacía.

```js
{ id: 'current', cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
```

Se agrega `game_pot` a `COLLECTIONS`. Los incrementos usan `updateDoc` + `increment()` de Firestore (atómico).

### Documento `game_config/loteria`

Configuración de la lotería. Se agrega a `COLLECTIONS`. Se seedea con valores por defecto.

```js
{
  id: 'loteria',
  commonMinRoll: 17,
  commonPrize:  { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
  specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 }
}
```

---

## Lógica del juego

```
roll = Math.floor(Math.random() * 20) + 1   // 1–20

if roll === 20        → specialPrize
if roll >= commonMinRoll && roll < 20 → commonPrize
if roll < commonMinRoll → sin premio
```

**Límite diario de jugadores:** verificar si existe `game_logs/{pjId}_loteria_{hoy}` en `db.game_logs` antes de permitir tirar.

**DM:** sin límite. Cada tirada genera un doc con id único basado en timestamp.

---

## Funciones nuevas en App.jsx / contexto

### `saveGameResult(actorType, pjId, roll)`

- Lee `game_config/loteria` de `db.game_config` para determinar premios.
- Calcula el premio según la lógica de arriba.
- Si `actorType === 'player'`:
  - Encuentra el PJ en `db.pjs` por `pjId`.
  - Usa `writeBatch`: escribe el `game_log` y actualiza las `monedas` del PJ.
- Si `actorType === 'dm'`:
  - Usa `writeBatch`: escribe el `game_log` y hace `batch.update(potRef, { cp: increment(prize.cp), sp: increment(prize.sp), ... })` para cada tipo de moneda ganado.

### `assignPotToPJ(pjId, amount: {cp, sp, ep, gp, pp})`

- Solo ejecutable por el DM desde Zona DM.
- `writeBatch`: disminuye `game_pot/current` y aumenta `monedas` del PJ indicado.
- Validación: no permitir asignar más de lo que hay en el pozo.

### `saveGameConfig(config)`

- `setDoc` en `game_config/loteria`.

---

## UI — Página `Juegos` (`src/pages/Juegos.jsx`)

### Visibilidad

- Visible para todos en el sidebar (sin restricción de sesión para ver).
- El botón "Tirar el dado" solo aparece si hay sesión activa (jugador o DM).

### Layout

```
┌─────────────────────────────────────────────┐
│  Juegos                                     │
├─────────────────────────────────────────────┤
│  ┌── POZO ACUMULADO ─────────────────────┐  │
│  │  cp: X   sp: Y   (más tipos si > 0)   │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  ┌── La Lotería del Dado ─────────────────┐  │
│  │  Premio común (≥{commonMinRoll}): ...  │  │
│  │  Premio especial (20 nat): ...         │  │
│  │                                        │  │
│  │  [grande: número del dado animado]     │  │
│  │                                        │  │
│  │  [Tirar el dado]  ← solo si sesión    │  │
│  │                                        │  │
│  │  ← resultado post-tirada →             │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Estados de la tarjeta de lotería

| Estado | Contenido |
|--------|-----------|
| Sin sesión | "Iniciá sesión para jugar." |
| Jugador — no jugó hoy | Botón activo "Tirar el dado" |
| Jugador — ya jugó, ganó | Resultado anterior + "Volvé mañana en X horas" |
| Jugador — ya jugó, no ganó | Resultado anterior + "Volvé mañana en X horas" |
| DM | Botón siempre activo + "Premio enviado al pozo" post-tirada |

### Animación del dado

- Al hacer click: número cicla aleatoriamente (~1.5s) usando `setInterval`, luego se detiene en el resultado final.
- Durante la animación el botón está deshabilitado.
- Resultado: número grande, coloreado según ganó (verde/dorado) o perdió (neutro).

---

## UI — Zona DM (`src/pages/ZonaDM.jsx`)

Nueva sección "Juegos" con tres subsecciones:

### 1. Configuración de la lotería

Formulario con:
- Input numérico `commonMinRoll` (1–19)
- Inputs cp/sp/ep/gp/pp para `commonPrize`
- Inputs cp/sp/ep/gp/pp para `specialPrize`
- Botón "Guardar configuración"

### 2. Pozo acumulado

- Muestra balance actual del `game_pot`.
- Select de PJ + inputs de cantidad (cp, sp, ep, gp, pp) para transferir.
- Botón "Transferir al PJ". Validación: no transferir más de lo disponible.

### 3. Registro de tiradas

Tabla con columnas: Actor | Tirada | Premio | Destino | Fecha/Hora  
Ordenada por `timestamp` descendente.  
"Actor" muestra nombre del PJ o "DM".

---

## Integraciones

| Archivo | Cambio |
|---------|--------|
| `src/App.jsx` | Agregar `game_logs`, `game_pot`, `game_config` a `COLLECTIONS`; seed de `game_pot` y `game_config`; `saveGameResult`, `assignPotToPJ`, `saveGameConfig` al contexto; `Juegos` a `PAGES` |
| `src/AppContext.jsx` | Exponer `saveGameResult`, `assignPotToPJ`, `saveGameConfig` |
| `src/components/Sidebar.jsx` | Agregar "Juegos" a NAV bajo "Homebrew", ícono `Dice5` de lucide |
| `src/pages/ZonaDM.jsx` | Nueva sección "Juegos" (config, pozo, log) |
| `src/pages/Juegos.jsx` | Nuevo archivo |
| `src/seed.js` | No necesario (game_pot y game_config se seedean desde App.jsx) |

---

## Consideraciones técnicas

- `updateDoc` + `increment()` para el pozo evita race conditions (aunque con 6 jugadores el riesgo es mínimo).
- `writeBatch` para operaciones de jugador (log + monedas) garantiza atomicidad.
- `game_config` tiene onSnapshot para que la página Juegos siempre refleje la config actual sin recargar.
- Los premios de la tabla de registro se muestran como string legible (ej. "3 cp", "1 sp") formateado desde el objeto `prize`.

---

## Fuera de scope (por ahora)

- Mini-juego de sorteo aleatorio del pozo.
- Más juegos más allá de la lotería.
- Historial de asignaciones del pozo desde Zona DM.
