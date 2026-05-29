# Dice3D — Cámara Cenital, Parallax Delta-Rotación, Bounce Zoom y Snap Final

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la perspectiva inclinada del d20 por vista cenital pura, parallax que reacciona instantáneamente a la inmovilidad del dado, zoom de rebote más dramático y snap final con rebote visible.

**Architecture:** Todos los cambios están en un único archivo: `src/components/Dice3D.jsx`. Se ajusta la posición de cámara, se reemplaza el bloque de parallax por velocidad con uno basado en delta de rotación por frame, y se actualizan 5 constantes numéricas. No se crean ni modifican otros archivos.

**Tech Stack:** Three.js (r160+), React 18, Vite 5. Sin test runner — verificación visual en `http://localhost:5173`.

---

### Antes de empezar — registrar el BASE_SHA

El squash final regresa hasta el commit anterior al spec. Ejecutar ahora y guardar el SHA:

```bash
git log --oneline -3
```

El SHA de `aa2d3bc` (feat: parallax backdrop...) es el BASE_SHA. Guardarlo; se usa en Task 5.

---

### Task 1: Cámara cenital pura

**Files:**
- Modify: `src/components/Dice3D.jsx:214`

- [ ] **Step 1: Cambiar posición de cámara**

En `src/components/Dice3D.jsx`, línea 214, cambiar:
```js
camera.position.set(0, 6, 0.8)
```
por:
```js
camera.position.set(0, 6, 0)
```
Las líneas 215-216 (`camera.lookAt` y `camera.up`) no cambian.

- [ ] **Step 2: Verificar visualmente**

```bash
npm run dev
```

Abrir `http://localhost:5173`. La vista del dado debe ser completamente cenital — sin tilt hacia adelante, el dado se ve como un trompo visto desde el techo. Hacer clic en el botón de tirar y confirmar que la animación completa funciona (throw → bounce → settle → snap → resultado).

- [ ] **Step 3: Commit**

```bash
git add src/components/Dice3D.jsx
git commit -m "feat: camera true top-down (remove z=0.8 tilt)"
```

---

### Task 2: Parallax por delta de rotación

**Files:**
- Modify: `src/components/Dice3D.jsx:278-303`

- [ ] **Step 1: Agregar variables de tracking prevRotX/Z**

En `src/components/Dice3D.jsx`, localizar la línea 278:
```js
const bgOff = { x: 0, y: 0 }
```
Agregar dos líneas debajo de esa:
```js
const bgOff = { x: 0, y: 0 }
let prevRotX = 0
let prevRotZ = 0
```

- [ ] **Step 2: Reemplazar el bloque de parallax en el frame loop**

Localizar el bloque actual en el frame loop (líneas 298-303):
```js
        // ── Parallax: die rotation scrolls the background ──
        // Accumulate offset proportional to angular velocity (opposite direction)
        bgOff.x -= rs.vz * 0.0035 * dt
        bgOff.y -= rs.vx * 0.0035 * dt
        bgTex.offset.x = bgOff.x
        bgTex.offset.y = bgOff.y
```

Reemplazar por:
```js
        // Parallax: rotation delta per frame — stops instantly when die stops
        const rawDX = dice.rotation.x - prevRotX
        const rawDZ = dice.rotation.z - prevRotZ
        const dX = Math.abs(rawDX) > 0.5 ? 0 : rawDX   // absorb gimbal-lock jumps
        const dZ = Math.abs(rawDZ) > 0.5 ? 0 : rawDZ
        bgOff.x -= dZ * 0.06
        bgOff.y -= dX * 0.06
        prevRotX = dice.rotation.x
        prevRotZ = dice.rotation.z
        bgTex.offset.x = bgOff.x
        bgTex.offset.y = bgOff.y
```

**Por qué 0.06:** Una rotación completa (2π rad) produce desplazamiento de ~0.38 UV, visible con textura en repeat 2.5×. El clamp a 0.5 rad descarta saltos de Euler que Three.js genera al actualizar el Euler desde el quaternion durante el slerp.

- [ ] **Step 3: Verificar visualmente**

```bash
npm run dev
```

Tirar el dado y observar dos cosas:
1. **Durante el giro:** el fondo de madera se desliza notoriamente en dirección opuesta a la rotación del dado.
2. **Al terminar el snap:** el fondo se **congela instantáneamente** sin seguir deslizando por inercia. Si el fondo sigue moviéndose un momento después de que el dado paró, el delta no está funcionando — revisar que `prevRotX`/`prevRotZ` estén declarados fuera de la función `frame`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dice3D.jsx
git commit -m "feat: parallax by rotation delta — stops instantly when die stops"
```

---

### Task 3: Bounce zoom más dramático

**Files:**
- Modify: `src/components/Dice3D.jsx:180-182`

- [ ] **Step 1: Actualizar las tres constantes de bounce**

En `src/components/Dice3D.jsx`, localizar las líneas 180-182:
```js
const BOUNCE_A   = 0.72   // peak zoom amplitude (scale = 1 + BOUNCE_A at peak)
const BOUNCE_W   = 14.5   // rad/s
const BOUNCE_D   = 4.5    // decay
```

Reemplazar por:
```js
const BOUNCE_A   = 1.2    // peak zoom amplitude (scale = 1 + BOUNCE_A at peak)
const BOUNCE_W   = 12.0   // rad/s
const BOUNCE_D   = 3.8    // decay
```

- [ ] **Step 2: Verificar visualmente**

```bash
npm run dev
```

Tirar el dado. En la fase de rebote (~0.9s después de entrar al centro) deben verse **3–4 pulsos de zoom** claramente decrecientes. El primer zoom hace que el dado se vea ~2.2× su tamaño normal (escala pico = 1 + 1.2 = 2.2). Los siguientes pulsos son progresivamente más chicos. Confirmar que el dado vuelve a escala 1 al terminar la fase bounce.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dice3D.jsx
git commit -m "feat: bounce zoom more dramatic (BOUNCE_A=1.2, BOUNCE_W=12, BOUNCE_D=3.8)"
```

---

### Task 4: Snap final con rebote visible

**Files:**
- Modify: `src/components/Dice3D.jsx:185,379`

- [ ] **Step 1: Extender SNAP_DUR**

En `src/components/Dice3D.jsx`, línea 185:
```js
const SNAP_DUR   = 0.38   // face alignment slerp duration
```
Cambiar a:
```js
const SNAP_DUR   = 0.50   // face alignment slerp duration
```

- [ ] **Step 2: Amplificar el rebote del snap**

En `src/components/Dice3D.jsx`, localizar la fórmula del bounce en la fase `snap` (~línea 379):
```js
            const bounce = 0.07 * Math.exp(-16 * rs.elapsed) * Math.sin(28 * rs.elapsed)
```
Cambiar a:
```js
            const bounce = 0.15 * Math.exp(-10 * rs.elapsed) * Math.sin(22 * rs.elapsed)
```

- [ ] **Step 3: Verificar visualmente**

```bash
npm run dev
```

Tirar el dado y observar el final de la animación (fase snap, ~0.5s). El dado debe:
1. Girar suavemente para alinear la cara ganadora hacia arriba (slerp).
2. Mostrar **2–3 oscilaciones de escala** perceptibles antes de asentarse en 1.0 — como un dado que termina de posarse en una cara estable.
3. Quedarse completamente quieto al terminar.
4. El resultado (número) debe mostrarse en pantalla confirmando que `onAnimationComplete` se llamó.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dice3D.jsx
git commit -m "feat: snap final con rebote visible (amp=0.15, decay lento, SNAP_DUR=0.50)"
```

---

### Task 5: Squash final

- [ ] **Step 1: Squash todos los commits al BASE_SHA**

Usando el SHA registrado antes de Task 1 (`aa2d3bc`):
```bash
git reset --soft aa2d3bc
```

Verificar que los archivos modificados están todos staged:
```bash
git status
```
Deben aparecer como staged: `src/components/Dice3D.jsx`, `docs/superpowers/specs/2026-05-29-dice3d-topdown-parallax-design.md`, y `docs/superpowers/plans/2026-05-29-dice3d-topdown-parallax.md`.

- [ ] **Step 2: Commit único final**

```bash
git commit -m "feat: Dice3D — cámara cenital, parallax delta-rotación, bounce zoom, snap con rebote"
```
