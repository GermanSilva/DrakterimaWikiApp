# PJDetail Sticky Nav Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que la barra de navegación rápida en PJDetail sea sticky, aparezca a la izquierda de la imagen y se expanda a ancho completo cuando la imagen sale del viewport.

**Architecture:** Fix de una línea en `styles.css` para desbloquear sticky. Reestructura del JSX en `PJDetail.jsx` para mover el nav inline al interior de la columna izquierda del header, con un IntersectionObserver (sentinel) sobre ese nav inline que activa un segundo nav sticky de ancho completo cuando el inline sale del viewport.

**Tech Stack:** React 18, Tailwind CSS, IntersectionObserver API (nativa del browser)

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/styles.css` | `overflow-x: hidden` → `overflow-x: clip` en `body` (línea 15) |
| `src/pages/pj/PJDetail.jsx` | Mover nav inline, agregar sentinel + sticky nav |

No hay test runner en el proyecto. La verificación es visual en el browser.

---

### Task 1: Fix del sticky en body

**Files:**
- Modify: `src/styles.css:15`

- [ ] **Step 1: Cambiar overflow-x en body**

En `src/styles.css`, línea 15, cambiar:

```css
/* Antes */
overflow-x: hidden;

/* Después */
overflow-x: clip;
```

`overflow-x: clip` recorta el contenido que desborda horizontalmente igual que `hidden`, pero no crea un Block Formatting Context, por lo que no rompe `position: sticky` en ningún descendiente.

- [ ] **Step 2: Verificar que no haya overflow horizontal visible**

Correr `npm run dev` y navegar por la app. Verificar que no aparezca scroll horizontal en ninguna página.

---

### Task 2: Reestructura del nav en PJDetail.jsx

**Files:**
- Modify: `src/pages/pj/PJDetail.jsx`

- [ ] **Step 1: Agregar imports de hooks**

Al principio de `src/pages/pj/PJDetail.jsx`, agregar `useRef`, `useState` y `useEffect` al import de React (actualmente no se importa nada de React porque se usa JSX transform):

```jsx
import { useRef, useState, useEffect } from 'react'
import { useApp } from '../../AppContext'
// ... resto de imports igual
```

- [ ] **Step 2: Agregar estado y ref del sentinel**

Dentro de `PJDetail`, después de las líneas existentes de `const visibleSections` y `const hasDMNotes`, agregar:

```jsx
const sentinelRef = useRef(null)
const [showStickyNav, setShowStickyNav] = useState(false)
const hasNav = visibleSections.length > 0 || hasDMNotes
```

- [ ] **Step 3: Agregar el useEffect con IntersectionObserver**

Después de la función `scrollTo`, agregar:

```jsx
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

El `threshold: 0` dispara el callback en cuanto cualquier píxel del sentinel entra o sale del viewport.

- [ ] **Step 4: Extraer navButtons como variable JSX**

Después del `useEffect`, antes del `return`, agregar:

```jsx
const navButtons = (
  <>
    {visibleSections.map(s => (
      <button
        key={s.id}
        className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-txt-muted hover:text-txt-primary hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
        onClick={() => scrollTo(s.id)}
      >
        {s.label}
      </button>
    ))}
    {hasDMNotes && (
      <button
        className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-accent-dim hover:text-accent-bright hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
        onClick={() => scrollTo('dm')}
      >
        <Lock size={10} className="inline mr-1" />DM
      </button>
    )}
  </>
)
```

- [ ] **Step 5: Reemplazar el JSX del return completo**

Reemplazar todo el contenido del `return (...)` con el siguiente JSX. El sticky nav condicional va antes del flex row; el nav inline (sentinel) va dentro de la columna izquierda:

```jsx
return (
  <div>
    <div className="flex justify-between mb-7">
      <button className={btnSecondary} onClick={onBack}>← Volver</button>
      {isDM && (
        <div className="flex items-center gap-2">
          <span className={articleLink} title="ID para wiki-link">
            {`{${pj.id}${COLLECTION_LETTER['pjs']}}`}
          </span>
          <button className={btnSecondary} onClick={onDelete}>Eliminar</button>
          <button className={btnSecondary} onClick={onEdit}>Editar</button>
        </div>
      )}
    </div>

    {showStickyNav && hasNav && (
      <div className="sticky top-0 z-10 bg-bg-card border-b border-border-base overflow-x-auto">
        <div className="flex min-w-max">{navButtons}</div>
      </div>
    )}

    <div className='flex w-full gap-4'>
      <div className='flex-1 flex flex-col gap-2 h-fit'>
        <div className="pb-5 border-b border-border-base">
          <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[pj.region] || '#6e6e6e' }}>
            Personaje Jugador
          </div>
          <div className="font-exo text-[26px] font-bold text-txt-primary uppercase">{pj.nombre}</div>
          <div className="font-exo text-[16px] font-semibold uppercase text-txt-muted -mt-1">{pj.jugador}</div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <Tag cls="pj" text={`${pj.clase || '?'} - Nv. ${pj.nivel || 1}`} />
            {pj.raza && <Tag cls="neutral" text={pj.raza} />}
            {pj.region && <RegionTag region={pj.region} />}
            {pj.alineamiento && <Tag cls="neutral" text={pj.alineamiento} />}
            {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
            {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
          </div>
        </div>

        {hasNav && (
          <div ref={sentinelRef} className="overflow-x-auto border-b border-border-base">
            <div className="flex min-w-max">{navButtons}</div>
          </div>
        )}
      </div>

      {pj.imagen_url && (
        <div className="my-4 text-center">
          <img
            src={pj.imagen_url}
            alt={pj.nombre}
            className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base"
            onError={e => e.target.style.display = 'none'}
          />
        </div>
      )}
    </div>

    {visibleSections.map(({ id, Component }) => (
      <Component key={id} pj={pj} />
    ))}

    {hasDMNotes && (
      <div id="pj-section-dm" className="mt-5 pt-4 border-t-2 border-t-accent">
        <div className="font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2">
          <Lock size={10} className="inline mr-1" />Notas DM
        </div>
        <div className={detailTextCls}><WikiText text={pj.notas} /></div>
      </div>
    )}

    <PlayerNotes entityType="pjs" entityId={pj.id} />
  </div>
)
```

- [ ] **Step 6: Verificar en el browser**

Con `npm run dev`, abrir un PJ con imagen y comprobar:
1. El nav aparece debajo del texto del personaje, a la izquierda de la imagen
2. Al scrollear hacia abajo, el nav sticky de ancho completo aparece en el top
3. Al scrollear de vuelta arriba, el sticky nav desaparece y el inline vuelve a ser visible
4. Abrir un PJ sin imagen: el nav ocupa el ancho completo desde el inicio

- [ ] **Step 7: Commit único al finalizar**

```bash
git add src/styles.css src/pages/pj/PJDetail.jsx
git commit -m "feat: sticky adaptive nav bar in PJDetail

- Fix overflow-x: hidden → clip en body para desbloquear sticky
- Nav inline en columna izquierda del header (a la izquierda de la imagen)
- IntersectionObserver sentinel: cuando nav inline sale del viewport,
  aparece nav sticky de ancho completo en top-0

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
