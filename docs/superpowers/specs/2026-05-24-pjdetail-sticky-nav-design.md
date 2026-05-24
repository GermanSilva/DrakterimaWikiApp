# PJDetail — Sticky Nav Bar con layout adaptativo

**Fecha:** 2026-05-24  
**Branch:** character-sheet  
**Archivos afectados:** `src/styles.css`, `src/pages/pj/PJDetail.jsx`

---

## Problema

La barra de acceso rápido a secciones en `PJDetail` no funciona como sticky. Además, su posición actual (debajo del bloque header+imagen completo) no es la deseada: debe aparecer debajo del texto del personaje, a la izquierda de la imagen.

### Causa raíz del sticky roto

`body` tiene `overflow-x: hidden` en `styles.css`. Esto crea un Block Formatting Context (BFC) que convierte al `body` en el scroll container, lo que impide que `position: sticky` funcione correctamente en los descendientes.

---

## Diseño

### Fix 1 — overflow-x: clip

Cambiar en `src/styles.css`:

```css
/* Antes */
body { overflow-x: hidden; }

/* Después */
body { overflow-x: clip; }
```

`overflow-x: clip` tiene el mismo efecto visual (corta el contenido que desborda horizontalmente) pero **no** crea un BFC, por lo que no rompe sticky en los hijos.

---

### Fix 2 — Reestructura del layout en PJDetail.jsx

**Layout objetivo:**

```
┌────────────────────────────┬────────────┐
│ Personaje Jugador          │            │
│ NOMBRE DEL PJ              │  [imagen]  │
│ Jugador / Tags             │            │
│ [Stats][Hab][Ataq][...]    │            │
└────────────────────────────┴────────────┘
[  secciones de contenido (ancho completo) ]
```

El nav bar se mueve de su posición actual (entre el flex row y las secciones) al interior de la columna izquierda del flex row, debajo del bloque de info del personaje.

- El nav usa `overflow-x: auto` para scrollear horizontalmente si los botones no caben en la columna angosta.
- Sin imagen: la columna izquierda es `flex-1` (ancho completo), por lo que el nav ocupa todo el ancho naturalmente.

---

### Fix 3 — Patrón centinela con IntersectionObserver

**Estado:**
```js
const [showStickyNav, setShowStickyNav] = useState(false)
const sentinelRef = useRef(null)
```

**Observer:**
```js
useEffect(() => {
  if (!sentinelRef.current) return
  const observer = new IntersectionObserver(
    ([entry]) => setShowStickyNav(!entry.isIntersecting),
    { threshold: 0 }
  )
  observer.observe(sentinelRef.current)
  return () => observer.disconnect()
}, [])
```

El `sentinelRef` se coloca en el nav inline. Cuando sale del viewport (usuario scrolleó hacia abajo), `showStickyNav` se vuelve `true`.

---

### Fix 4 — Nav sticky de ancho completo

Se renderiza condicionalmente antes del flex row del header:

```jsx
{showStickyNav && hasNav && (
  <div className="sticky top-0 z-10 bg-bg-card border-b border-border-base overflow-x-auto">
    <div className="flex min-w-max">{navButtons}</div>
  </div>
)}
```

Como cuando `showStickyNav` se vuelve `true` el usuario ya scrolleó más allá del header, este elemento aparece inmediatamente en posición sticky (top: 0) sin producir salto de layout perceptible.

---

### Extracción de navButtons

Para no duplicar el JSX de los botones, se extrae como variable:

```jsx
const navButtons = (
  <>
    {visibleSections.map(s => (
      <button key={s.id} className="..." onClick={() => scrollTo(s.id)}>
        {s.label}
      </button>
    ))}
    {hasDMNotes && (
      <button className="..." onClick={() => scrollTo('dm')}>
        <Lock size={10} className="inline mr-1" />DM
      </button>
    )}
  </>
)
```

Usado tanto en el nav inline (con `ref={sentinelRef}`) como en el sticky.

---

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Sin imagen | El nav inline ocupa todo el ancho (columna es `flex-1`). El IntersectionObserver igual funciona cuando el usuario scrollea hacia las secciones. |
| Sin secciones visibles | `hasNav` es `false`, ningún nav se renderiza. |
| Mobile | La imagen y la columna izquierda ya colapsan en el flex row. El nav ocupa el ancho disponible con scroll horizontal si es necesario. |

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/styles.css` | `overflow-x: hidden` → `overflow-x: clip` en `body` |
| `src/pages/pj/PJDetail.jsx` | Mover nav al interior de la columna izquierda, agregar `useRef`/`useState`/`useEffect` para el centinela, agregar sticky nav condicional |
