# SRD / Referencia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una página "SRD / Reglas" al wiki Drakterima para consultar contenido D&D 5e en tiempo real via la API pública de open5e (`https://api.open5e.com/v1/`).

**Architecture:** Nueva página `src/pages/SRD.jsx` con barra de pestañas horizontal que renderiza seis componentes tab independientes (uno por sección SRD). Lógica async compartida en el hook `useTabFetch` (`src/srd/srdCommon.jsx`). Cambiar de pestaña fuerza remount via React `key` prop, reseteando todo el estado automáticamente. Sin interacción con Firebase. **Un solo commit al final de toda la implementación** (no commits intermedios).

**Tech Stack:** React 18, Vite 5, open5e REST API, Tailwind + CSS custom properties existentes, Lucide React.

---

### Task 1: Capa de acceso a la API

**Files:**
- Create: `src/srd/srdApi.js`

- [ ] **Crear `src/srd/srdApi.js`** con una función por endpoint:

```js
const BASE = 'https://api.open5e.com'

async function apiFetch(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Error ${res.status} al contactar la API`)
  return res.json()
}

function buildUrl(path, params) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function fetchSpells({ search = '', level = '', school = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/spells/', {
    search, limit: 20,
    ...(level !== '' && { level_int: level }),
    ...(school !== '' && { school }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchMonsters({ search = '', challenge_rating = '', type = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/monsters/', {
    search, limit: 20,
    ...(challenge_rating !== '' && { challenge_rating }),
    ...(type !== '' && { type }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchConditions() {
  const data = await apiFetch(buildUrl('/v1/conditions/', { limit: 50 }))
  return { results: data.results }
}

export async function fetchWeapons({ search = '', category = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/weapons/', {
    search, limit: 20,
    ...(category !== '' && { category }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchArmors({ search = '', category = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/armor/', {
    search, limit: 20,
    ...(category !== '' && { category }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}

export async function fetchMagicItems({ search = '', rarity = '', pageUrl = null } = {}) {
  const url = pageUrl ?? buildUrl('/v1/magicitems/', {
    search, limit: 20,
    ...(rarity !== '' && { rarity }),
  })
  const data = await apiFetch(url)
  return { results: data.results, next: data.next ?? null }
}
```

- [ ] **Verificar manualmente** que la URL se construye correctamente abriendo en consola:
  ```
  import { fetchSpells } from './src/srd/srdApi.js'
  fetchSpells({ search: 'fire' }).then(console.log)
  ```
  Esperado: objeto con `results` (array) y `next` (string o null).

---

### Task 2: Hook compartido y primitivos UI

**Files:**
- Create: `src/srd/srdCommon.jsx`

- [ ] **Crear `src/srd/srdCommon.jsx`** con `useTabFetch`, `SRDDetailHeader` y `SRDList`:

```jsx
import { useState, useRef, useEffect } from 'react'
import { btnSecondary } from '../constants'

export function useTabFetch(fetchFn) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nextUrl, setNextUrl] = useState(null)

  function run(params, append = false) {
    setLoading(true)
    setError(null)
    fetchFn(params)
      .then(({ results: r, next }) => {
        setResults(prev => append ? [...prev, ...r] : r)
        setNextUrl(next ?? null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  return { results, loading, error, nextUrl, run }
}

export function SRDDetailHeader({ name, subtitle, onBack }) {
  const backBarRef = useRef(null)
  const nameRef = useRef(null)
  const [showName, setShowName] = useState(false)

  useEffect(() => {
    if (!nameRef.current) return
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const obs = new IntersectionObserver(
      ([e]) => setShowName(!e.isIntersecting),
      { threshold: 0, rootMargin: `-${60 + backBarH}px 0px 0px 0px` }
    )
    obs.observe(nameRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <>
      <div ref={backBarRef} className="flex items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary truncate px-4 pointer-events-none"
          style={{ opacity: showName ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {name}
        </span>
      </div>
      <div className="mb-8 pb-5 border-b border-border-base">
        {subtitle && (
          <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
            {subtitle}
          </div>
        )}
        <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {name}
        </div>
      </div>
    </>
  )
}

export function SRDList({ results, loading, error, nextUrl, onLoadMore, renderItem, emptyMsg }) {
  return (
    <div>
      {error && (
        <div className="text-accent text-sm py-4 font-exo">{error}</div>
      )}
      {!loading && !error && results.length === 0 && (
        <div className="text-txt-muted text-sm py-10 text-center font-exo tracking-[0.1em] uppercase">
          {emptyMsg}
        </div>
      )}
      <div className="space-y-1">
        {results.map(renderItem)}
      </div>
      {loading && (
        <div className="text-txt-muted text-sm py-4 text-center font-exo tracking-[0.1em] uppercase">
          Cargando…
        </div>
      )}
      {nextUrl && !loading && (
        <div className="mt-4 text-center">
          <button className={btnSecondary} onClick={onLoadMore}>Ver más</button>
        </div>
      )}
    </div>
  )
}
```

---

### Task 3: SpellsTab — Hechizos

**Files:**
- Create: `src/srd/SpellsTab.jsx`

- [ ] **Crear `src/srd/SpellsTab.jsx`**:

```jsx
import { useState, useRef, useEffect } from 'react'
import { fetchSpells } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation']

function SpellDetail({ spell, onBack }) {
  const school = spell.school?.name ?? spell.school ?? ''
  const levelLabel = spell.level_int === 0 ? 'Truco' : `Nivel ${spell.level_int}`

  return (
    <div>
      <SRDDetailHeader name={spell.name} subtitle={`Hechizo · ${levelLabel} · ${school}`} onBack={onBack} />

      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Descripción</div>
        {(spell.desc || '').split('\n').filter(Boolean).map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
        {spell.higher_level && (
          <>
            <div className={`${sectionTitleCls} mt-4`}>A niveles superiores</div>
            <p className={detailTextCls}>{spell.higher_level}</p>
          </>
        )}
      </div>

      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Tiempo de lanzamiento', spell.casting_time],
            ['Alcance', spell.range],
            ['Componentes', spell.components],
            ['Duración', spell.duration],
            ['Concentración', spell.concentration ? 'Sí' : null],
            ['Ritual', spell.ritual ? 'Sí' : null],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {spell.dnd_class && (
        <div className={detailSectionCls}>
          <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium mb-1">Clases</div>
          <div className="text-txt-secondary text-sm">{spell.dnd_class}</div>
        </div>
      )}
    </div>
  )
}

export default function SpellsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchSpells)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [school, setSchool] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, level, school }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, level, school])

  if (selected) return <SpellDetail spell={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar hechizo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">Nivel</option>
          <option value="0">Truco (0)</option>
          {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>Nivel {n}</option>)}
        </select>
        <select className={inputCls} style={{ width: 'auto' }} value={school} onChange={e => setSchool(e.target.value)}>
          <option value="">Escuela</option>
          {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || level || school ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={spell => (
          <div
            key={spell.slug}
            onClick={() => setSelected(spell)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{spell.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              {spell.level_int === 0 ? 'Truco' : `Nv ${spell.level_int}`} · {spell.school?.name ?? spell.school}
            </span>
          </div>
        )}
      />
    </div>
  )
}
```

---

### Task 4: MonstersTab — Monstruos

**Files:**
- Create: `src/srd/MonstersTab.jsx`

- [ ] **Crear `src/srd/MonstersTab.jsx`**:

```jsx
import { useState, useRef, useEffect } from 'react'
import { fetchMonsters } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const CR_OPTIONS = [
  { label: '0', value: '0' },
  { label: '⅛', value: '0.125' },
  { label: '¼', value: '0.25' },
  { label: '½', value: '0.5' },
  ...Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })),
]

const MONSTER_TYPES = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon',
  'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid',
  'Monstrosity', 'Ooze', 'Plant', 'Undead',
]

function statMod(score) {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

function formatSpeed(speed) {
  if (!speed) return '—'
  if (typeof speed === 'string') return speed
  return Object.entries(speed)
    .filter(([, v]) => v)
    .map(([k, v]) => k === 'walk' ? v : `${k} ${v}`)
    .join(', ')
}

function MonsterDetail({ monster, onBack }) {
  const stats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
  const statLabels = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR']

  return (
    <div>
      <SRDDetailHeader
        name={monster.name}
        subtitle={`${monster.size ?? ''} ${monster.type ?? ''} · CR ${monster.challenge_rating}`}
        onBack={onBack}
      />

      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['CA', monster.armor_class + (monster.armor_desc ? ` (${monster.armor_desc})` : '')],
            ['PV', `${monster.hit_points} (${monster.hit_dice})`],
            ['Velocidad', formatSpeed(monster.speed)],
            ['Alineamiento', monster.alignment],
            ['CR', monster.challenge_rating],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Estadísticas</div>
        <div className="grid grid-cols-6 gap-2 text-center">
          {stats.map((stat, i) => (
            <div key={stat} className="border border-border-base p-2">
              <div className="font-exo text-[9px] tracking-[0.15em] text-txt-muted uppercase font-semibold">{statLabels[i]}</div>
              <div className="font-exo text-[15px] font-bold text-txt-primary mt-0.5">{monster[stat]}</div>
              <div className="font-exo text-[11px] text-txt-muted">{statMod(monster[stat])}</div>
            </div>
          ))}
        </div>
      </div>

      {monster.special_abilities?.length > 0 && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Habilidades especiales</div>
          {monster.special_abilities.map((a, i) => (
            <div key={i} className="mb-3">
              <div className="font-exo text-[11px] font-semibold text-txt-primary">{a.name}</div>
              <p className={`${detailTextCls} mt-0.5`}>{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {monster.actions?.length > 0 && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Acciones</div>
          {monster.actions.map((a, i) => (
            <div key={i} className="mb-3">
              <div className="font-exo text-[11px] font-semibold text-txt-primary">{a.name}</div>
              <p className={`${detailTextCls} mt-0.5`}>{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {monster.legendary_actions?.length > 0 && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Acciones legendarias</div>
          {monster.legendary_actions.map((a, i) => (
            <div key={i} className="mb-3">
              <div className="font-exo text-[11px] font-semibold text-txt-primary">{a.name}</div>
              <p className={`${detailTextCls} mt-0.5`}>{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {monster.desc && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Descripción</div>
          {monster.desc.split('\n').filter(Boolean).map((p, i) => (
            <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MonstersTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchMonsters)
  const [search, setSearch] = useState('')
  const [cr, setCr] = useState('')
  const [type, setType] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, challenge_rating: cr, type }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, cr, type])

  if (selected) return <MonsterDetail monster={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar monstruo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={cr} onChange={e => setCr(e.target.value)}>
          <option value="">CR</option>
          {CR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={inputCls} style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">Tipo</option>
          {MONSTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || cr || type ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={monster => (
          <div
            key={monster.slug}
            onClick={() => setSelected(monster)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{monster.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              CR {monster.challenge_rating} · {monster.type}
            </span>
          </div>
        )}
      />
    </div>
  )
}
```

---

### Task 5: ConditionsTab — Condiciones

**Files:**
- Create: `src/srd/ConditionsTab.jsx`

- [ ] **Crear `src/srd/ConditionsTab.jsx`**:

```jsx
import { useState, useEffect } from 'react'
import { fetchConditions } from './srdApi'
import { SRDDetailHeader } from './srdCommon'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

function ConditionDetail({ cond, onBack }) {
  const paragraphs = Array.isArray(cond.desc) ? cond.desc : [cond.desc].filter(Boolean)
  return (
    <div>
      <SRDDetailHeader name={cond.name} subtitle="Condición" onBack={onBack} />
      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Efecto</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
    </div>
  )
}

export default function ConditionsTab() {
  const [conditions, setConditions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchConditions()
      .then(({ results }) => setConditions(results))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (selected) return <ConditionDetail cond={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      {error && <div className="text-accent text-sm py-4 font-exo">{error}</div>}
      {loading && (
        <div className="text-txt-muted text-sm py-10 text-center font-exo tracking-[0.1em] uppercase">Cargando…</div>
      )}
      <div className="space-y-1">
        {conditions.map(cond => (
          <div
            key={cond.slug}
            onClick={() => setSelected(cond)}
            className="flex items-center px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{cond.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### Task 6: WeaponsTab — Armas

**Files:**
- Create: `src/srd/WeaponsTab.jsx`

- [ ] **Crear `src/srd/WeaponsTab.jsx`**:

```jsx
import { useState, useRef, useEffect } from 'react'
import { fetchWeapons } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const WEAPON_CATEGORIES = [
  'Simple Melee Weapons',
  'Simple Ranged Weapons',
  'Martial Melee Weapons',
  'Martial Ranged Weapons',
]

function WeaponDetail({ weapon, onBack }) {
  const properties = (weapon.properties || []).map(p => p.name ?? p).join(', ')
  return (
    <div>
      <SRDDetailHeader name={weapon.name} subtitle={`Arma · ${weapon.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Daño', weapon.damage_dice ? `${weapon.damage_dice} ${weapon.damage_type ?? ''}` : null],
            ['Categoría', weapon.category],
            ['Propiedades', properties || null],
            ['Peso', weapon.weight],
            ['Precio', weapon.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function WeaponsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchWeapons)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, category }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, category])

  if (selected) return <WeaponDetail weapon={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar arma…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Categoría</option>
          {WEAPON_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || category ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={weapon => (
          <div
            key={weapon.slug}
            onClick={() => setSelected(weapon)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{weapon.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              {weapon.damage_dice} · {weapon.damage_type}
            </span>
          </div>
        )}
      />
    </div>
  )
}
```

---

### Task 7: ArmorsTab — Armaduras

**Files:**
- Create: `src/srd/ArmorsTab.jsx`

- [ ] **Crear `src/srd/ArmorsTab.jsx`**:

```jsx
import { useState, useRef, useEffect } from 'react'
import { fetchArmors } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
import { inputCls, detailSectionCls } from '../constants'

const ARMOR_CATEGORIES = ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield']

function formatAC(ac) {
  if (!ac) return '—'
  if (typeof ac === 'number' || typeof ac === 'string') return String(ac)
  const base = ac.base ?? ''
  const dex = ac.dex_bonus ? ' + Dex' : ''
  const maxDex = ac.max_bonus != null ? ` (máx ${ac.max_bonus})` : ''
  return `${base}${dex}${maxDex}`
}

function ArmorDetail({ armor, onBack }) {
  return (
    <div>
      <SRDDetailHeader name={armor.name} subtitle={`Armadura · ${armor.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['CA', formatAC(armor.armor_class)],
            ['Categoría', armor.category],
            ['Req. Fuerza', armor.strength_prerequisite ? `FUE ${armor.strength_prerequisite}` : null],
            ['Desventaja sigilo', armor.stealth_disadvantage ? 'Sí' : null],
            ['Peso', armor.weight],
            ['Precio', armor.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ArmorsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchArmors)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, category }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, category])

  if (selected) return <ArmorDetail armor={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar armadura…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Categoría</option>
          {ARMOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || category ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={armor => (
          <div
            key={armor.slug}
            onClick={() => setSelected(armor)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{armor.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              CA {formatAC(armor.armor_class)} · {armor.category}
            </span>
          </div>
        )}
      />
    </div>
  )
}
```

---

### Task 8: MagicItemsTab — Ítems mágicos

**Files:**
- Create: `src/srd/MagicItemsTab.jsx`

- [ ] **Crear `src/srd/MagicItemsTab.jsx`**:

```jsx
import { useState, useRef, useEffect } from 'react'
import { fetchMagicItems } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary']

function MagicItemDetail({ item, onBack }) {
  const attunement = item.requires_attunement
    ? (typeof item.requires_attunement === 'string' ? item.requires_attunement : 'Sí')
    : null
  const paragraphs = Array.isArray(item.desc) ? item.desc : [item.desc].filter(Boolean)

  return (
    <div>
      <SRDDetailHeader
        name={item.name}
        subtitle={`Ítem mágico · ${item.rarity ?? ''} · ${item.type ?? ''}`}
        onBack={onBack}
      />

      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {[
            ['Rareza', item.rarity],
            ['Tipo', item.type],
            ['Sintonía', attunement],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className={sectionTitleCls}>Descripción</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
    </div>
  )
}

export default function MagicItemsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchMagicItems)
  const [search, setSearch] = useState('')
  const [rarity, setRarity] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, rarity }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, rarity])

  if (selected) return <MagicItemDetail item={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar ítem mágico…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={rarity} onChange={e => setRarity(e.target.value)}>
          <option value="">Rareza</option>
          {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || rarity ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={item => (
          <div
            key={item.slug}
            onClick={() => setSelected(item)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{item.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              {item.rarity} · {item.type}
            </span>
          </div>
        )}
      />
    </div>
  )
}
```

---

### Task 9: Página SRD.jsx + registro en Sidebar y App — commit único

**Files:**
- Create: `src/pages/SRD.jsx`
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/App.jsx`

- [ ] **Crear `src/pages/SRD.jsx`**:

```jsx
import { useState } from 'react'
import SpellsTab from '../srd/SpellsTab'
import MonstersTab from '../srd/MonstersTab'
import ConditionsTab from '../srd/ConditionsTab'
import WeaponsTab from '../srd/WeaponsTab'
import ArmorsTab from '../srd/ArmorsTab'
import MagicItemsTab from '../srd/MagicItemsTab'

const TABS = [
  { id: 'spells',     label: 'Hechizos',      component: SpellsTab },
  { id: 'monsters',   label: 'Monstruos',      component: MonstersTab },
  { id: 'conditions', label: 'Condiciones',    component: ConditionsTab },
  { id: 'weapons',    label: 'Armas',          component: WeaponsTab },
  { id: 'armors',     label: 'Armaduras',      component: ArmorsTab },
  { id: 'magicitems', label: 'Ítems mágicos',  component: MagicItemsTab },
]

export default function SRD() {
  const [activeTab, setActiveTab] = useState('spells')
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component

  return (
    <div>
      <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-5 font-medium">
        SRD · Referencia D&D 5e
      </div>

      <div className="flex border-b border-border-base overflow-x-auto mb-6 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'font-exo text-[10px] font-semibold tracking-[0.1em] uppercase px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors cursor-pointer bg-transparent shrink-0',
              activeTab === tab.id
                ? 'border-b-accent text-accent-bright'
                : 'border-b-transparent text-txt-muted hover:text-txt-secondary',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {ActiveComponent && <ActiveComponent key={activeTab} />}
    </div>
  )
}
```

- [ ] **Modificar `src/components/Sidebar.jsx`** — agregar sección "Referencia" con ítem SRD. Agregar el import de `BookMarked` a la línea de imports de lucide y añadir la sección al array `NAV`:

En el import de lucide existente, agregar `BookMarked`:
```js
import {
  LayoutDashboard, Scroll, Shield, Users, Map,
  Landmark, BookOpen, Gem, NotebookPen, SlidersHorizontal, Dices, BookMarked,
} from 'lucide-react'
```

Agregar al final del array `NAV` (antes del cierre `]`):
```js
  {
    section: 'Referencia', items: [
      { id: 'srd', icon: BookMarked, label: 'SRD / Reglas' },
    ]
  },
```

- [ ] **Modificar `src/App.jsx`** — importar SRD y registrarlo en PAGES:

Agregar el import junto a los demás imports de páginas:
```js
import SRD from './pages/SRD'
```

Agregar al objeto `PAGES`:
```js
  srd: SRD,
```

- [ ] **Verificar en el browser** — `npm run dev`, navegar a "SRD / Reglas" en el sidebar, probar:
  1. Pestaña Hechizos: buscar "fireball" → aparece resultado → click → detalle con descripción y campos.
  2. Pestaña Monstruos: buscar "goblin" → aparece → detalle con stats.
  3. Pestaña Condiciones: carga automática de ~15 ítems → click → detalle.
  4. Pestaña Armas: buscar "sword" → aparece → detalle con daño.
  5. Pestaña Armaduras: filtrar por "Light Armor" → aparecen resultados.
  6. Pestaña Ítems mágicos: buscar "ring" → filtrar por "Rare" → resultados.
  7. Cambiar de pestaña vuelve a la lista (estado resetea).
  8. "← Volver" desde el detalle vuelve a la lista.
  9. Botón "Ver más" carga resultados adicionales.

- [ ] **Hacer el commit único** con todos los archivos de la feature:

```bash
git add src/srd/srdApi.js src/srd/srdCommon.jsx src/srd/SpellsTab.jsx src/srd/MonstersTab.jsx src/srd/ConditionsTab.jsx src/srd/WeaponsTab.jsx src/srd/ArmorsTab.jsx src/srd/MagicItemsTab.jsx src/pages/SRD.jsx src/components/Sidebar.jsx src/App.jsx
git commit -m "feat: sección SRD — referencia D&D 5e via API open5e

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
