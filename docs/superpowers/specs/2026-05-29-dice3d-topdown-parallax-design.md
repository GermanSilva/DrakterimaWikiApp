# Spec: Dice3D — cámara cenital, parallax por delta de rotación, bounce zoom y snap final

**Fecha:** 2026-05-29
**Archivo afectado:** `src/components/Dice3D.jsx`

## Objetivo

Rediseñar la animación del d20 para que la perspectiva sea verdaderamente cenital (cámara directamente desde arriba), los rebotes se perciban como zooms hacia el dado (proximidad), el fondo se traslade en contra del movimiento de rotación del dado con respuesta inmediata a la inmovilidad, y el snap final luzca como un dado posándose establemente.

## 1. Cámara — top-down puro

**Cambio:** `camera.position.set(0, 6, 0.8)` → `camera.position.set(0, 6, 0)`

Eliminar el offset `z=0.8` que producía el tilt de ~30°. La cámara queda directamente sobre el origen mirando hacia abajo. `camera.up.set(0, 0, -1)` y `camera.lookAt(0, 0, 0)` no cambian.

Con esta configuración:
- Screen derecha = world +X
- Screen arriba = world −Z
- El dado entra desde la esquina superior-derecha (THROW_FROM sigue siendo (5, 0, -4), que es correcto)

## 2. Parallax — delta de rotación acumulado (Enfoque C)

**Motivación:** Con la velocidad × dt, el fondo sigue deslizando brevemente tras detener el dado. Con delta de rotación por frame, el background se congela exactamente cuando el dado para.

**Implementación:**

Antes del loop de frames, inicializar:
```js
let prevRotX = 0
let prevRotZ = 0
```

En cada frame, reemplazar el bloque de parallax actual por:
```js
const rawDX = dice.rotation.x - prevRotX
const rawDZ = dice.rotation.z - prevRotZ
// Clamp para absorber saltos de gimbal lock (e.g., wrap de ±π)
const dX = Math.abs(rawDX) > 0.5 ? 0 : rawDX
const dZ = Math.abs(rawDZ) > 0.5 ? 0 : rawDZ
bgOff.x -= dZ * 0.06
bgOff.y -= dX * 0.06
prevRotX = dice.rotation.x
prevRotZ = dice.rotation.z
bgTex.offset.x = bgOff.x
bgTex.offset.y = bgOff.y
```

**Escala 0.06:** Una rotación completa del dado (2π rad) produce un desplazamiento de 0.06 × 2π ≈ 0.38 unidades UV — visible pero no exagerado con la textura de madera en repeat 2.5×.

**Comportamiento por fase:**
- `idle`: el dado gira lentamente (vx=0.06 rad/s), el fondo hace una micro-deriva casi imperceptible.
- `throw`: el dado gira a alta velocidad → fondo se desplaza notoriamente.
- `bounce` / `settle`: velocidad cae gradualmente → desplazamiento cae en proporción exacta.
- `snap`: el slerp cambia la rotación del dado → el delta alimenta el parallax; al completarse el slerp, delta = 0, fondo congela inmediatamente.
- `done`: dado estático, delta = 0, fondo congela.

**Gimbal lock:** Cuando Three.js actualiza el Euler desde el quaternion (fase snap), puede producir saltos de ±π en algún eje. El clamp a ±0.5 rad descarta esos frames anómalos sin afectar la continuidad visual.

## 3. Bounce zoom — más dramático

| Constante | Valor actual | Valor nuevo | Motivo |
|---|---|---|---|
| `BOUNCE_A` | `0.72` | `1.2` | Zoom más pronunciado en cada rebote |
| `BOUNCE_W` | `14.5` | `12.0` | Rebotes ligeramente más lentos y visibles |
| `BOUNCE_D` | `4.5` | `3.8` | Decay más lento → 3–4 zooms visibles |

La fórmula `height = BOUNCE_A × exp(−BOUNCE_D × t) × |sin(BOUNCE_W × t)|` permanece igual. Con los nuevos valores se producen 3–4 pulsos de escala decrecientes claramente perceptibles.

## 4. Snap final — rebote más visible

**Cambio en la fórmula del bounce de snap:**
```
// Actual
0.07 * Math.exp(-16 * rs.elapsed) * Math.sin(28 * rs.elapsed)

// Nuevo
0.15 * Math.exp(-10 * rs.elapsed) * Math.sin(22 * rs.elapsed)
```

- Amplitud: `0.07 → 0.15` (doble)
- Decay: `-16 → -10` (más lento → 2–3 oscilaciones visibles)
- Frecuencia: `28 → 22` rad/s (oscilación algo más lenta para que sea perceptible)

**`SNAP_DUR`:** `0.38 → 0.50` s para dar espacio a las oscilaciones adicionales.

El comportamiento semántico no cambia: el dado alinea la cara ganadora hacia +Y (hacia la cámara), y el rebote de escala representa el dado "asentándose" en esa cara final.

## 5. Sin cambios

- `THROW_FROM = new THREE.Vector3(5, 0, -4)` — entra desde esquina superior-derecha, correcto para top-down.
- `THROW_DUR`, `STOP_SPEED` — sin cambios.
- Geometría, materiales, texturas, iluminación — sin cambios.
- Fase `idle` — sin cambios (la micro-deriva del parallax en idle es aceptable y sutil).
- `detectTopFace` y lógica de face alignment — sin cambios.

## Archivos a modificar

- `src/components/Dice3D.jsx` — único archivo afectado. Todos los cambios son constantes numéricas y el bloque de parallax en el frame loop.
