# Juegos — Lotería del Dado: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Juegos" section with a configurable d20 dice lottery: players get 1 roll/day with winnings credited to their PJ's monedas; the DM rolls unlimited with winnings going to a public shared pot manageable from Zona DM.

**Architecture:** Three new Firestore collections (`game_logs`, `game_pot`, `game_config`) tracked via onSnapshot in App.jsx. Three new context functions (`saveGameResult`, `assignPotToPJ`, `saveGameConfig`) handle all mutations. One new page (`Juegos.jsx`) and one extended page (`ZonaDM.jsx`) consume them.

**Tech Stack:** React 18, Firebase Firestore v9 (modular), Tailwind CSS, lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/Juegos.jsx` | **Create** | Pot display, dice animation, game states |
| `src/App.jsx` | **Modify** | New collections, seeds, 3 context functions, PAGES entry |
| `src/components/Sidebar.jsx` | **Modify** | Add Juegos nav item |
| `src/pages/ZonaDM.jsx` | **Modify** | Config form, pot management, roll history log |

---

## Task 1: Create `src/pages/Juegos.jsx`

**Files:**
- Create: `src/pages/Juegos.jsx`

No test runner in this project. Verify visually with `npm run dev` after Task 2 wires up the page.

- [ ] **Step 1: Create the file with complete implementation**

```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { Dice5 } from 'lucide-react'
import { sectionTitleCls, btnPrimary } from '../constants'

const COIN_TYPES = ['cp', 'sp', 'ep', 'gp', 'pp']
const COIN_LABELS = { cp: 'bronce', sp: 'plata', ep: 'electrum', gp: 'oro', pp: 'platino' }
const DEFAULT_CONFIG = {
  commonMinRoll: 17,
  commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
  specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
}

function formatPrize(prize) {
  const parts = COIN_TYPES.filter(c => (prize[c] || 0) > 0).map(c => `${prize[c]} ${COIN_LABELS[c]}`)
  return parts.length > 0 ? parts.join(', ') : 'nada'
}

function hoursUntilMidnight() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const diff = midnight - now
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`
}

export default function Juegos() {
  const { db, currentPlayer, isDM, saveGameResult, showToast } = useApp()

  const config = (db.game_config || []).find(c => c.id === 'loteria') ?? DEFAULT_CONFIG
  const pot = (db.game_pot || []).find(p => p.id === 'current') ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const potHasValue = COIN_TYPES.some(c => (pot[c] || 0) > 0)

  const today = new Date().toISOString().slice(0, 10)
  const todayLog = currentPlayer
    ? (db.game_logs || []).find(l => l.id === `${currentPlayer.id}_loteria_${today}`)
    : null

  const [rolling, setRolling] = useState(false)
  const [displayNum, setDisplayNum] = useState(null)
  const [lastResult, setLastResult] = useState(null) // { roll, prize }

  const hasSession = isDM || !!currentPlayer
  const alreadyPlayedToday = !isDM && !!todayLog

  function calcPrize(roll) {
    if (roll === 20) return { ...config.specialPrize }
    if (roll >= config.commonMinRoll) return { ...config.commonPrize }
    return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  }

  function handleRoll() {
    if (rolling || alreadyPlayedToday) return
    setRolling(true)
    setLastResult(null)

    const finalRoll = Math.floor(Math.random() * 20) + 1
    let step = 0
    const totalSteps = Math.floor(1500 / 80)

    const interval = setInterval(() => {
      setDisplayNum(Math.floor(Math.random() * 20) + 1)
      step++
      if (step >= totalSteps) {
        clearInterval(interval)
        setDisplayNum(finalRoll)
        const prize = calcPrize(finalRoll)
        setLastResult({ roll: finalRoll, prize })
        saveGameResult(isDM ? 'dm' : 'player', currentPlayer?.id ?? null, finalRoll)
          .catch(() => showToast('Error al guardar. Intentá de nuevo.'))
        setRolling(false)
      }
    }, 80)
  }

  const shownResult = lastResult ?? (todayLog ? { roll: todayLog.roll, prize: todayLog.prize } : null)
  const wonSomething = shownResult && COIN_TYPES.some(c => (shownResult.prize?.[c] || 0) > 0)

  return (
    <div>
      <div className="mb-7 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Homebrew
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase flex items-center gap-3">
          <Dice5 size={22} className="text-accent" />
          Juegos
        </div>
      </div>

      {potHasValue && (
        <div className="mb-5 bg-bg-card border border-border-base px-5 py-4">
          <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase font-semibold mb-2">
            Pozo acumulado
          </div>
          <div className="flex gap-5 flex-wrap">
            {COIN_TYPES.filter(c => (pot[c] || 0) > 0).map(c => (
              <span key={c} className="font-exo text-[14px] text-accent-bright font-semibold tracking-[0.04em]">
                {pot[c]} {COIN_LABELS[c]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-bg-card border border-border-base px-6 py-6">
        <div className={sectionTitleCls + ' mb-4'}>La Lotería del Dado</div>

        <div className="mb-5 flex flex-col gap-1.5 text-[13px] text-txt-secondary">
          <div>
            <span className="font-exo text-[10px] uppercase tracking-[0.1em] text-txt-muted">Premio común</span>
            {' '}(≥{config.commonMinRoll}): <span className="text-accent-bright font-semibold">{formatPrize(config.commonPrize)}</span>
          </div>
          <div>
            <span className="font-exo text-[10px] uppercase tracking-[0.1em] text-txt-muted">Premio especial</span>
            {' '}(20 nat): <span className="text-accent-bright font-semibold">{formatPrize(config.specialPrize)}</span>
          </div>
        </div>

        <div className="flex justify-center my-6">
          <div
            className={[
              'w-24 h-24 flex items-center justify-center border-2 font-exo text-4xl font-bold tracking-tight select-none transition-colors',
              rolling ? 'border-accent-dim text-txt-muted animate-pulse' : '',
              !rolling && wonSomething ? 'border-accent text-accent-bright' : '',
              !rolling && shownResult && !wonSomething ? 'border-border-base text-txt-secondary' : '',
              displayNum === null && !rolling ? 'border-border-base text-txt-muted' : '',
            ].filter(Boolean).join(' ')}
          >
            {displayNum !== null ? displayNum : 'd20'}
          </div>
        </div>

        {!hasSession && (
          <p className="text-center text-[13px] text-txt-muted italic mt-2">
            Iniciá sesión para jugar.
          </p>
        )}

        {hasSession && !alreadyPlayedToday && (
          <div className="flex justify-center">
            <button className={btnPrimary} onClick={handleRoll} disabled={rolling}>
              {rolling ? 'Tirando…' : 'Tirar el dado'}
            </button>
          </div>
        )}

        {shownResult && (
          <div className={['mt-5 text-center', wonSomething ? 'text-accent-bright' : 'text-txt-muted'].join(' ')}>
            {wonSomething ? (
              <>
                <div className="font-exo text-[15px] font-semibold tracking-[0.1em] uppercase">¡Ganaste!</div>
                <div className="text-[13px] mt-1">
                  {isDM
                    ? `${formatPrize(shownResult.prize)} enviados al pozo.`
                    : `${formatPrize(shownResult.prize)} añadidos a tu bolsa.`}
                </div>
              </>
            ) : (
              <div className="font-exo text-[13px] tracking-[0.05em]">Sin premio esta vez.</div>
            )}
          </div>
        )}

        {!isDM && alreadyPlayedToday && (
          <div className="mt-4 text-center text-[12px] text-txt-muted italic">
            Ya jugaste hoy. Volvé en {hoursUntilMidnight()}.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Juegos.jsx
git commit -m "feat: add Juegos page — dice lottery with pot display and game states"
```

---

## Task 2: Wire up Firestore collections and context functions in `src/App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add `increment` to the Firebase import (lines 6–9)**

Replace:
```js
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, getDocs, writeBatch,
} from 'firebase/firestore'
```

With:
```js
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, getDocs, writeBatch, increment,
} from 'firebase/firestore'
```

- [ ] **Step 2: Import Juegos page (after line 24, after the `Items` import)**

Add this line after `import Items from './pages/Items'`:
```js
import Juegos from './pages/Juegos'
```

- [ ] **Step 3: Expand COLLECTIONS (line 35)**

Replace:
```js
const COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'player_notes', 'login_logs']
```

With:
```js
const COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'player_notes', 'login_logs', 'game_logs', 'game_pot', 'game_config']
```

- [ ] **Step 4: Add PAGES entry for juegos (in the `PAGES` object, after `items: Items`)**

Replace:
```js
const PAGES = {
  dashboard: Dashboard,
  zonaDM: ZonaDM,
  notas: Notas,
  sesiones: Sesiones,
  pjs: PJs,
  pnjs: PNJs,
  lugares: Lugares,
  facciones: Facciones,
  lore: Lore,
  items: Items,
}
```

With:
```js
const PAGES = {
  dashboard: Dashboard,
  zonaDM: ZonaDM,
  notas: Notas,
  sesiones: Sesiones,
  pjs: PJs,
  pnjs: PNJs,
  lugares: Lugares,
  facciones: Facciones,
  lore: Lore,
  items: Items,
  juegos: Juegos,
}
```

- [ ] **Step 5: Add game seeds inside `maybeSeed()` (after the existing `seedCollectionIfEmpty` calls, around line 83)**

After the line `await seedCollectionIfEmpty('lore', defaultData.lore)`, add:
```js
await seedCollectionIfEmpty('game_pot', [{ id: 'current', cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }])
await seedCollectionIfEmpty('game_config', [{
  id: 'loteria',
  commonMinRoll: 17,
  commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
  specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
}])
```

- [ ] **Step 6: Add `saveGameResult`, `assignPotToPJ`, and `saveGameConfig` functions**

Add these three functions after the `savePlayerNote` function (around line 160):

```js
async function saveGameResult(actorType, pjId, roll) {
  const config = (db.game_config || []).find(c => c.id === 'loteria') ?? {
    commonMinRoll: 17,
    commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
    specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
  }
  let prize = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  if (roll === 20) prize = { ...config.specialPrize }
  else if (roll >= config.commonMinRoll) prize = { ...config.commonPrize }

  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const timestamp = now.toISOString()
  const logId = actorType === 'player'
    ? `${pjId}_loteria_${date}`
    : `dm_loteria_${Date.now()}`

  const batch = writeBatch(firestore)
  batch.set(doc(firestore, 'game_logs', logId), {
    id: logId, actorType, playerId: pjId ?? null,
    game: 'loteria', date, timestamp, roll, prize,
    prizeTarget: actorType === 'player' ? 'player' : 'pot',
  })

  if (actorType === 'player' && pjId != null) {
    const pj = (db.pjs || []).find(p => p.id === pjId)
    if (pj) {
      const monedas = {
        cp: (pj.monedas?.cp || 0) + prize.cp,
        sp: (pj.monedas?.sp || 0) + prize.sp,
        ep: (pj.monedas?.ep || 0) + prize.ep,
        gp: (pj.monedas?.gp || 0) + prize.gp,
        pp: (pj.monedas?.pp || 0) + prize.pp,
      }
      batch.set(doc(firestore, 'pjs', String(pjId)), { ...pj, monedas, updatedAt: timestamp }, { merge: true })
    }
  } else {
    batch.set(doc(firestore, 'game_pot', 'current'), {
      cp: increment(prize.cp),
      sp: increment(prize.sp),
      ep: increment(prize.ep),
      gp: increment(prize.gp),
      pp: increment(prize.pp),
    }, { merge: true })
  }

  await batch.commit()
}

async function assignPotToPJ(pjId, amount) {
  const pot = (db.game_pot || []).find(p => p.id === 'current') ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const COIN_TYPES = ['cp', 'sp', 'ep', 'gp', 'pp']
  for (const coin of COIN_TYPES) {
    if ((amount[coin] || 0) > (pot[coin] || 0))
      throw new Error(`No hay suficiente ${coin} en el pozo.`)
  }
  const pj = (db.pjs || []).find(p => p.id === pjId)
  if (!pj) return

  const now = new Date().toISOString()
  const monedas = { ...pj.monedas }
  const potUpdate = {}
  for (const coin of COIN_TYPES) {
    monedas[coin] = (monedas[coin] || 0) + (amount[coin] || 0)
    potUpdate[coin] = increment(-(amount[coin] || 0))
  }

  const batch = writeBatch(firestore)
  batch.set(doc(firestore, 'game_pot', 'current'), potUpdate, { merge: true })
  batch.set(doc(firestore, 'pjs', String(pjId)), { ...pj, monedas, updatedAt: now }, { merge: true })
  await batch.commit()
  showToast('Monedas transferidas')
}

async function saveGameConfig(config) {
  await setDoc(doc(firestore, 'game_config', 'loteria'), { ...config, id: 'loteria' })
  showToast('Configuración guardada')
}
```

- [ ] **Step 7: Expose the three new functions in `ctx` (in the `ctx` object, after `savePlayerNote`)**

In the `ctx` object (around line 265), add after `savePlayerNote,`:
```js
saveGameResult,
assignPotToPJ,
saveGameConfig,
```

- [ ] **Step 8: Verify build compiles without errors**

```bash
npm run build
```

Expected: build completes with no errors. If `Dice5` is not a valid lucide icon name, it will error — in that case use `Dices` instead in both `Juegos.jsx` and `Sidebar.jsx`.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire game_logs/game_pot/game_config collections, seed, and context functions"
```

---

## Task 3: Add Juegos nav item to `src/components/Sidebar.jsx`

**Files:**
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 1: Add `Dice5` (or `Dices`) to the lucide import**

Replace the current import (line 1–6):
```js
import { useApp } from '../AppContext'
import {
  LayoutDashboard, Scroll, Shield, Users, Map,
  Landmark, BookOpen, Gem, NotebookPen, SlidersHorizontal,
} from 'lucide-react'
```

With:
```js
import { useApp } from '../AppContext'
import {
  LayoutDashboard, Scroll, Shield, Users, Map,
  Landmark, BookOpen, Gem, NotebookPen, SlidersHorizontal, Dices,
} from 'lucide-react'
```

> **Note:** If `npm run build` in Task 2 Step 8 revealed `Dice5` is invalid, use `Dices` here (and in Juegos.jsx). The lucide v0.x icon name varies by version — `Dices` is the safer choice.

- [ ] **Step 2: Add the Juegos item under the Homebrew section in `NAV`**

Replace:
```js
  {
    section: 'Homebrew', items: [
      { id: 'items', icon: Gem, label: 'Ítems', count: true },
    ]
  },
```

With:
```js
  {
    section: 'Homebrew', items: [
      { id: 'items', icon: Gem, label: 'Ítems', count: true },
      { id: 'juegos', icon: Dices, label: 'Juegos' },
    ]
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat: add Juegos nav item to sidebar"
```

---

## Task 4: Add Juegos section to `src/pages/ZonaDM.jsx`

**Files:**
- Modify: `src/pages/ZonaDM.jsx`

- [ ] **Step 1: Add `Dices` icon import and destructure new context functions**

Replace the current imports at the top of `ZonaDM.jsx`:
```js
import { useState, useRef } from 'react'
import { useApp } from '../AppContext'
import { firestore } from '../firebase'
import { writeBatch, doc, deleteDoc } from 'firebase/firestore'
import { SlidersHorizontal, Trash2 } from 'lucide-react'
```

With:
```js
import { useState, useRef } from 'react'
import { useApp } from '../AppContext'
import { firestore } from '../firebase'
import { writeBatch, doc, deleteDoc } from 'firebase/firestore'
import { SlidersHorizontal, Trash2 } from 'lucide-react'

const COIN_TYPES = ['cp', 'sp', 'ep', 'gp', 'pp']
const COIN_LABELS = { cp: 'bronce', sp: 'plata', ep: 'electrum', gp: 'oro', pp: 'platino' }
```

> No new lucide icon needed since the sidebar already shows the icon. `COIN_TYPES`/`COIN_LABELS` constants are module-level so both `JuegosSection` and its helpers can use them.

- [ ] **Step 2: Add the `JuegosSection` component at the bottom of the file (before `Section` and `Action` function definitions)**

Add this entire component before the `function Section(...)` definition at the bottom of `ZonaDM.jsx`:

```js
function JuegosSection() {
  const { db, showToast, saveGameConfig, assignPotToPJ } = useApp()

  const config = (db.game_config || []).find(c => c.id === 'loteria') ?? {
    commonMinRoll: 17,
    commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
    specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
  }
  const pot = (db.game_pot || []).find(p => p.id === 'current') ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const pjs = (db.pjs || [])
  const gameLogs = [...(db.game_logs || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const [cfgForm, setCfgForm] = useState({
    commonMinRoll: config.commonMinRoll,
    commonPrize: { ...config.commonPrize },
    specialPrize: { ...config.specialPrize },
  })
  const [assignForm, setAssignForm] = useState({ pjId: '', cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })
  const [saving, setSaving] = useState(false)
  const [transferring, setTransferring] = useState(false)

  const fieldCls = 'bg-bg-mid border border-border-base text-txt-primary font-barlow text-sm px-3 py-1.5 outline-none transition-colors focus:border-accent-dim'
  const labelCls = 'font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5 block'
  const btnCls = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-muted border border-border-light hover:border-accent-dim hover:text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed'

  async function handleSaveConfig() {
    setSaving(true)
    try { await saveGameConfig(cfgForm) }
    finally { setSaving(false) }
  }

  async function handleTransfer() {
    if (!assignForm.pjId) { showToast('Seleccioná un PJ'); return }
    const total = COIN_TYPES.reduce((s, c) => s + (Number(assignForm[c]) || 0), 0)
    if (total === 0) { showToast('Ingresá una cantidad'); return }
    setTransferring(true)
    try {
      const amount = Object.fromEntries(COIN_TYPES.map(c => [c, Number(assignForm[c]) || 0]))
      await assignPotToPJ(Number(assignForm.pjId), amount)
      setAssignForm(f => ({ ...f, cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }))
    } catch (e) {
      showToast(e.message || 'Error al transferir')
    } finally {
      setTransferring(false)
    }
  }

  function actorLabel(log) {
    if (log.actorType === 'dm') return 'DM'
    const pj = pjs.find(p => p.id === log.playerId)
    return pj ? pj.nombre : `PJ #${log.playerId}`
  }

  function prizeLabel(prize) {
    const parts = COIN_TYPES.filter(c => (prize?.[c] || 0) > 0).map(c => `${prize[c]} ${c}`)
    return parts.length > 0 ? parts.join(', ') : '—'
  }

  return (
    <>
      <Section title="Juegos — Configuración de lotería">
        <div className="bg-bg-card border border-border-base px-5 py-4 flex flex-col gap-4">
          <div>
            <label className={labelCls}>Tirada mínima para premio común</label>
            <input
              type="number" min={1} max={19}
              value={cfgForm.commonMinRoll}
              onChange={e => setCfgForm(f => ({ ...f, commonMinRoll: Number(e.target.value) }))}
              className={fieldCls + ' w-20'}
            />
          </div>
          <div>
            <label className={labelCls}>Premio común — cp / sp / ep / gp / pp</label>
            <div className="flex gap-2 flex-wrap">
              {COIN_TYPES.map(c => (
                <input key={c} type="number" min={0}
                  value={cfgForm.commonPrize[c] || 0}
                  onChange={e => setCfgForm(f => ({ ...f, commonPrize: { ...f.commonPrize, [c]: Number(e.target.value) } }))}
                  className={fieldCls + ' w-16'}
                  title={COIN_LABELS[c]}
                />
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Premio especial (20 nat) — cp / sp / ep / gp / pp</label>
            <div className="flex gap-2 flex-wrap">
              {COIN_TYPES.map(c => (
                <input key={c} type="number" min={0}
                  value={cfgForm.specialPrize[c] || 0}
                  onChange={e => setCfgForm(f => ({ ...f, specialPrize: { ...f.specialPrize, [c]: Number(e.target.value) } }))}
                  className={fieldCls + ' w-16'}
                  title={COIN_LABELS[c]}
                />
              ))}
            </div>
          </div>
          <div>
            <button className={btnCls} onClick={handleSaveConfig} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Juegos — Pozo acumulado">
        <div className="bg-bg-card border border-border-base px-5 py-4">
          <div className="flex gap-5 flex-wrap mb-4">
            {COIN_TYPES.map(c => (
              <span key={c} className="font-exo text-[13px] text-txt-secondary">
                <span className="text-accent-bright font-semibold">{pot[c] || 0}</span>{' '}{c}
              </span>
            ))}
          </div>
          <div className="mb-3">
            <label className={labelCls}>Transferir al PJ</label>
            <div className="flex flex-wrap gap-2">
              <select
                value={assignForm.pjId}
                onChange={e => setAssignForm(f => ({ ...f, pjId: e.target.value }))}
                className={fieldCls + ' min-w-[140px]'}
              >
                <option value="">— Seleccionar PJ —</option>
                {pjs.map(pj => (
                  <option key={pj.id} value={pj.id}>{pj.nombre}</option>
                ))}
              </select>
              {COIN_TYPES.map(c => (
                <input key={c} type="number" min={0}
                  value={assignForm[c] || 0}
                  onChange={e => setAssignForm(f => ({ ...f, [c]: e.target.value }))}
                  className={fieldCls + ' w-16'}
                  title={COIN_LABELS[c]}
                />
              ))}
            </div>
          </div>
          <button className={btnCls} onClick={handleTransfer} disabled={transferring}>
            {transferring ? 'Transfiriendo…' : 'Transferir al PJ'}
          </button>
        </div>
      </Section>

      <Section title="Juegos — Registro de tiradas">
        {gameLogs.length === 0 ? (
          <div className="text-[13px] text-txt-muted italic px-1">Sin tiradas aún.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] text-txt-secondary border-collapse">
              <thead>
                <tr className="border-b border-border-base font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted">
                  <th className="text-left py-2 pr-4 font-semibold">Actor</th>
                  <th className="text-left py-2 pr-4 font-semibold">Tirada</th>
                  <th className="text-left py-2 pr-4 font-semibold">Premio</th>
                  <th className="text-left py-2 pr-4 font-semibold">Destino</th>
                  <th className="text-left py-2 font-semibold">Fecha/Hora</th>
                </tr>
              </thead>
              <tbody>
                {gameLogs.map(log => (
                  <tr key={log.id} className="border-b border-border-base/50 hover:bg-bg-mid/40">
                    <td className="py-2 pr-4 font-semibold text-txt-primary">{actorLabel(log)}</td>
                    <td className="py-2 pr-4">{log.roll}</td>
                    <td className="py-2 pr-4 text-accent-bright">{prizeLabel(log.prize)}</td>
                    <td className="py-2 pr-4">{log.prizeTarget === 'pot' ? 'Pozo' : 'Jugador'}</td>
                    <td className="py-2">{formatTimestamp(log.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}
```

- [ ] **Step 3: Render `<JuegosSection />` in the ZonaDM component**

In the `return (...)` of the `ZonaDM` component, add `<JuegosSection />` after the "Registro de accesos" `<Section>` block and before the "Mantenimiento" `<Section>` block:

```jsx
      </Section>

      <JuegosSection />

      <Section title="Mantenimiento">
```

- [ ] **Step 4: Verify dev server with DM login**

```bash
npm run dev
```

Open http://localhost:5173, log in as DM. Navigate to Zona DM and verify:
- "Juegos — Configuración de lotería" section appears with inputs pre-filled from Firestore defaults
- "Juegos — Pozo acumulado" section shows balance (0 on first run)
- "Juegos — Registro de tiradas" section shows "Sin tiradas aún."

Navigate to Juegos page and verify:
- Page header shows, prize table shows configured values
- d20 placeholder shows "d20"
- DM: "Tirar el dado" button is active
- Roll the die: animation cycles numbers, settles on result, shows win/loss message
- If win: pot card updates in Zona DM

Log in as a player and verify:
- Roll once: result shown, "Ya jugaste hoy. Volvé en Xh Ym."
- Refresh: still shows today's result and countdown
- Check PJ monedas in ficha: updated correctly if won

- [ ] **Step 5: Commit**

```bash
git add src/pages/ZonaDM.jsx
git commit -m "feat: add Juegos section to Zona DM — config, pot management, roll log"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** game_logs ✓, game_pot ✓, game_config ✓, saveGameResult ✓, assignPotToPJ ✓, saveGameConfig ✓, Juegos page all states ✓, ZonaDM config/pot/log ✓, 1 roll/day player ✓, DM unlimited ✓, public pot display ✓
- [x] **No placeholders:** All steps have complete, runnable code
- [x] **Type consistency:** `COIN_TYPES`, `COIN_LABELS`, `DEFAULT_CONFIG` defined in scope where used; `formatPrize`/`hoursUntilMidnight` in Juegos.jsx only; `actorLabel`/`prizeLabel` in JuegosSection only; `formatTimestamp` reused from module scope in ZonaDM.jsx
- [x] **Icon name:** `Dices` used throughout (safer than `Dice5` which may not exist in all lucide versions). Task 2 Step 8 (`npm run build`) catches this before Task 3.
- [x] **Atomic writes:** Player rolls use `writeBatch` (log + monedas); DM rolls use `writeBatch` (log + pot via `increment`); `assignPotToPJ` uses `writeBatch` (pot decrement + pj monedas increment)
- [x] **Daily limit:** checked via `db.game_logs.find(l => l.id === \`${currentPlayer.id}_loteria_${today}\`)` before allowing roll
