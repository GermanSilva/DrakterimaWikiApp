# Spell Details on PJ Sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender el sistema de hechizos en la ficha de PJ para almacenar y mostrar características completas (escuela, casting time, alcance, componentes, duración, concentración, ritual, preparado, descripción) con un modal de detalle al hacer click en el chip del hechizo.

**Architecture:** Tres cambios coordinados: (1) nuevo `SpellDetailModal.jsx` — modal read-only standalone; (2) `PJSpellsSection.jsx` — chips clicables con lógica de color y badges C/R; (3) `SpellsCRUD.jsx` — inline form extendido con todos los campos nuevos. Los datos se almacenan en `pj.hechizos[]` en Firestore. Sin migración requerida — los campos nuevos son opcionales.

**Tech Stack:** React 18, Tailwind CSS (clases del proyecto), Firestore (sin cambios de schema), sin test runner.

---

## Archivos

| Acción | Ruta |
|---|---|
| Crear | `src/pages/pj/detail/SpellDetailModal.jsx` |
| Modificar | `src/pages/pj/detail/PJSpellsSection.jsx` |
| Modificar | `src/pages/pj/form/SpellsCRUD.jsx` |

---

### Task 1: Crear `SpellDetailModal.jsx`

**Files:**
- Create: `src/pages/pj/detail/SpellDetailModal.jsx`

Modal read-only que muestra los detalles de un hechizo. Cierra con Escape o click en el overlay.

- [ ] **Step 1: Crear el archivo**

Crear `src/pages/pj/detail/SpellDetailModal.jsx` con el siguiente contenido:

```jsx
import { useEffect } from 'react'
import { detailSectionCls, sectionTitleCls } from '../../../constants'

export default function SpellDetailModal({ spell, onClose }) {
  const levelLabel = spell.nivel === 0 ? 'Truco' : `Nivel ${spell.nivel}`

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-base max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-base flex items-start justify-between gap-4">
          <div>
            <div className="font-exo text-[18px] font-bold text-txt-primary uppercase">{spell.nombre}</div>
            <div className="font-exo text-[11px] text-txt-muted tracking-[0.15em] uppercase mt-0.5">
              {levelLabel}
              {spell.escuela ? ` · ${spell.escuela}` : ''}
              {spell.concentracion ? ' · Concentración' : ''}
              {spell.ritual ? ' · Ritual' : ''}
            </div>
          </div>
          <button
            className="text-txt-muted hover:text-txt-primary text-xl leading-none shrink-0 border-none bg-transparent cursor-pointer mt-0.5"
            onClick={onClose}
          >×</button>
        </div>

        {(spell.casting_time || spell.alcance || spell.componentes || spell.duracion) && (
          <div className={detailSectionCls}>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Tiempo de lanzamiento', spell.casting_time],
                ['Alcance', spell.alcance],
                ['Componentes', spell.componentes],
                ['Duración', spell.duracion],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
                  <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {spell.descripcion && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Descripción</div>
            {spell.descripcion.split('\n').filter(Boolean).map((p, i) => (
              <p key={i} className="text-txt-secondary text-[13px] mb-2">{p}</p>
            ))}
          </div>
        )}

        {spell.a_niveles_superiores && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>A niveles superiores</div>
            <p className="text-txt-secondary text-[13px]">{spell.a_niveles_superiores}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que no hay errores de import**

Ejecutar `npm run dev` y confirmar que la app levanta sin errores en consola.
El componente todavía no se usa en ningún lugar, así que no habrá cambio visual.

---

### Task 2: Actualizar `PJSpellsSection.jsx` — chips clicables + modal

**Files:**
- Modify: `src/pages/pj/detail/PJSpellsSection.jsx`

Agregar estado `selectedSpell`, convertir los `<span>` de hechizos en `<button>` clicables con lógica de color, badges C/R, y render del modal.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```jsx
import { useState } from 'react'
import { sectionTitleCls, detailSectionCls } from '../../../constants'
import SpellDetailModal from './SpellDetailModal'

const SPELL_LEVELS = ['Trucos', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6', 'Nivel 7', 'Nivel 8', 'Nivel 9']

export default function PJSpellsSection({ pj }) {
  const [selectedSpell, setSelectedSpell] = useState(null)
  const hechizos = pj.hechizos ?? []
  const slots = pj.spell_slots ?? {}
  const byLevel = {}
  hechizos.forEach(h => {
    const lvl = h.nivel ?? 0
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(h)
  })

  return (
    <div id="pj-section-hechizos" className={detailSectionCls}>
      <div className={sectionTitleCls}>Hechizos</div>

      {(pj.spell_dc > 0 || pj.spell_attack_bonus) && (
        <div className="flex gap-6 mb-4">
          {pj.spell_dc > 0 && (
            <div className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">DC Conjuración</div>
              <div className="font-exo text-[20px] font-bold text-accent-dim">{pj.spell_dc}</div>
            </div>
          )}
          {pj.spell_attack_bonus !== undefined && pj.spell_attack_bonus !== 0 && (
            <div className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Bono Ataque</div>
              <div className="font-exo text-[20px] font-bold text-accent-dim">{pj.spell_attack_bonus >= 0 ? `+${pj.spell_attack_bonus}` : pj.spell_attack_bonus}</div>
            </div>
          )}
          {pj.spell_ability && (
            <div className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Atributo</div>
              <div className="font-exo text-[20px] font-bold text-accent-dim">{pj.spell_ability}</div>
            </div>
          )}
        </div>
      )}

      {Object.keys(slots).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(slots).map(([lvl, max]) => max > 0 && (
            <div key={lvl} className="border border-border-base px-3 py-1.5 text-center min-w-[52px]">
              <div className="font-exo text-[9px] text-txt-muted">Niv {lvl}</div>
              <div className="font-exo text-[13px] font-semibold text-txt-primary">{max}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Object.keys(byLevel).sort((a, b) => a - b).map(lvl => (
          <div key={lvl}>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1.5">
              {SPELL_LEVELS[lvl] ?? `Nivel ${lvl}`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {byLevel[lvl].map(h => {
                const isPrepared = h.preparado || Number(h.nivel) === 0
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedSpell(h)}
                    className={`px-2.5 py-1 text-[12px] border cursor-pointer transition-colors flex items-center gap-1 ${
                      isPrepared
                        ? 'bg-accent text-white border-accent hover:bg-accent-bright'
                        : 'bg-bg-mid border-border-base text-txt-secondary hover:border-accent-dim'
                    }`}
                  >
                    {h.nombre}
                    {h.concentracion && <span className="text-[10px] opacity-70 ml-0.5">C</span>}
                    {h.ritual && <span className="text-[10px] opacity-70 ml-0.5">R</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedSpell && (
        <SpellDetailModal spell={selectedSpell} onClose={() => setSelectedSpell(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar en el navegador**

Con `npm run dev`, navegar a la ficha de un PJ que tenga hechizos:
- Los chips son clicables (cursor pointer).
- Los trucos (nivel 0) tienen fondo rojo.
- Los hechizos con `preparado: true` tienen fondo rojo.
- Click en cualquier chip abre el modal con los datos disponibles.
- Escape y click en el overlay cierran el modal.

---

### Task 3: Extender `SpellsCRUD.jsx` con todos los campos nuevos

**Files:**
- Modify: `src/pages/pj/form/SpellsCRUD.jsx`

Reemplazar el inline form de 2 campos por el form completo con todos los campos del schema.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```jsx
import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../constants'

const EMPTY = {
  nombre: '', nivel: 0, preparado: false, escuela: '',
  casting_time: '', alcance: '', componentes: '', duracion: '',
  concentracion: false, ritual: false,
  descripcion: '', a_niveles_superiores: '',
}
const LEVELS = ['Truco (0)', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function SpellsCRUD({ hechizos = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [showUpcast, setShowUpcast] = useState(false)

  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))
  const toggle = k => e => setDraft(p => ({ ...p, [k]: e.target.checked }))

  function startAdd() { setDraft(EMPTY); setShowUpcast(false); setEditingId('new') }
  function startEdit(h) {
    setDraft({ ...EMPTY, ...h })
    setShowUpcast(!!h.a_niveles_superiores)
    setEditingId(h.id)
  }
  function cancel() { setEditingId(null) }

  function confirm() {
    const item = {
      ...draft,
      nivel: parseInt(draft.nivel) || 0,
      concentracion: !!draft.concentracion,
      ritual: !!draft.ritual,
      preparado: !!draft.preparado,
    }
    if (editingId === 'new') {
      onChange([...hechizos, { ...item, id: Date.now() }])
    } else {
      onChange(hechizos.map(h => h.id === editingId ? { ...item, id: editingId } : h))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(hechizos.filter(h => h.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Nombre</label>
          <input className={inputCls} value={draft.nombre} onChange={set('nombre')} />
        </div>
        <div>
          <label className={labelCls}>Nivel</label>
          <select className={inputCls} value={draft.nivel} onChange={set('nivel')}>
            {LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Escuela</label>
          <input className={inputCls} value={draft.escuela} onChange={set('escuela')} placeholder="Evocación…" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Tiempo lanzamiento</label>
          <input className={inputCls} value={draft.casting_time} onChange={set('casting_time')} placeholder="1 acción" />
        </div>
        <div>
          <label className={labelCls}>Alcance</label>
          <input className={inputCls} value={draft.alcance} onChange={set('alcance')} placeholder="18 m" />
        </div>
        <div>
          <label className={labelCls}>Componentes</label>
          <input className={inputCls} value={draft.componentes} onChange={set('componentes')} placeholder="V, S, M" />
        </div>
        <div>
          <label className={labelCls}>Duración</label>
          <input className={inputCls} value={draft.duracion} onChange={set('duracion')} placeholder="Instantáneo" />
        </div>
      </div>

      <div className="flex gap-5">
        <label className="flex items-center gap-2 cursor-pointer font-exo text-[11px] text-txt-secondary">
          <input type="checkbox" checked={!!draft.preparado} onChange={toggle('preparado')} />
          Preparado
        </label>
        <label className="flex items-center gap-2 cursor-pointer font-exo text-[11px] text-txt-secondary">
          <input type="checkbox" checked={!!draft.concentracion} onChange={toggle('concentracion')} />
          Concentración
        </label>
        <label className="flex items-center gap-2 cursor-pointer font-exo text-[11px] text-txt-secondary">
          <input type="checkbox" checked={!!draft.ritual} onChange={toggle('ritual')} />
          Ritual
        </label>
      </div>

      <div>
        <label className={labelCls}>Descripción</label>
        <textarea
          className={inputCls}
          rows={3}
          value={draft.descripcion}
          onChange={set('descripcion')}
          style={{ resize: 'vertical' }}
        />
      </div>

      {(showUpcast || draft.a_niveles_superiores) ? (
        <div>
          <label className={labelCls}>A niveles superiores</label>
          <textarea
            className={inputCls}
            rows={2}
            value={draft.a_niveles_superiores}
            onChange={set('a_niveles_superiores')}
            style={{ resize: 'vertical' }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors"
          onClick={() => setShowUpcast(true)}
        >
          + A niveles superiores
        </button>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
          onClick={confirm}
        >
          Guardar
        </button>
      </div>
    </div>
  )

  const byLevel = {}
  hechizos.forEach(h => {
    const lvl = h.nivel ?? 0
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(h)
  })
  const LEVEL_LABELS = ['Trucos', 'Niv 1', 'Niv 2', 'Niv 3', 'Niv 4', 'Niv 5', 'Niv 6', 'Niv 7', 'Niv 8', 'Niv 9']

  return (
    <div>
      {Object.keys(byLevel).sort((a, b) => a - b).map(lvl => (
        <div key={lvl} className="mb-3">
          <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1.5">
            {LEVEL_LABELS[lvl] ?? `Niv ${lvl}`}
          </div>
          <div className="space-y-1">
            {byLevel[lvl].map(h => (
              <div key={h.id}>
                {editingId === h.id ? inlineForm : (
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-txt-primary flex-1">{h.nombre}</span>
                    {h.concentracion && <span className="font-exo text-[10px] text-txt-muted">C</span>}
                    {h.ritual && <span className="font-exo text-[10px] text-txt-muted">R</span>}
                    <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px]" onClick={() => startEdit(h)}>✎</button>
                    <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(h.id)}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {editingId === 'new' && inlineForm}
      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1" onClick={startAdd}>
          + Agregar hechizo
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar en el navegador**

Con `npm run dev`, abrir el formulario de un PJ (pestaña "Mecánicas"):
- "+ Agregar hechizo" despliega el form con 3 filas de campos de texto, checkboxes y textareas.
- El botón "+ A niveles superiores" aparece y al hacer click muestra el textarea correspondiente.
- Si se edita un hechizo existente con `a_niveles_superiores`, el campo aparece directo sin necesidad del botón.
- Guardar un hechizo con todos los campos y verificar que se persiste (abrir el modal de detalle desde la ficha del PJ).

---

### Task 4: Commit final

- [ ] **Step 1: Commit**

```bash
git add src/pages/pj/detail/SpellDetailModal.jsx src/pages/pj/detail/PJSpellsSection.jsx src/pages/pj/form/SpellsCRUD.jsx
git commit -m "feat: características y descripción de hechizos en ficha PJ"
```
