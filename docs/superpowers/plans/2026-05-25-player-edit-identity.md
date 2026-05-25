# Player Self-Edit of PJ Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each logged-in player to edit the Identity fields of their own PJ via the existing form modal, excluding DM-controlled fields (Nivel, Experiencia, Notas del DM, EstadoField).

**Architecture:** Four targeted edits to existing files — no new components. Permission is enforced at the context layer (`openForm`) and at the form layer (`isOwnPlayer`). DM-controlled fields are preserved in the saved data because they live in form state initialized from `item` and are never cleared, even though they are not rendered for players.

**Tech Stack:** React 18, Vite 5, Firebase Firestore. No test runner. Manual verification via browser.

---

## File Map

| File | Change |
|------|--------|
| `src/App.jsx:252` | Extend `openForm` guard to allow player to open their own PJ |
| `src/pages/pj/PJDetail.jsx:33-101` | Consume `currentPlayer` from context; add Editar button for own player |
| `src/pages/pj/PJForm.jsx:8-194` | Compute `isOwnPlayer`; filter TABS; hide Eliminar; pass prop to identity tab |
| `src/pages/pj/form/PJIdentityTab.jsx:15-96` | Accept `isOwnPlayer`; hide Nivel, Experiencia, EstadoField |

---

## Task 1: Extend `openForm` permission in App.jsx

**Files:**
- Modify: `src/App.jsx:252`

- [ ] **Step 1: Change the `openForm` guard**

In `src/App.jsx`, find line 252:
```js
openForm: (type, id = null) => { if (isDM) setForm({ type, id }) },
```
Replace with:
```js
openForm: (type, id = null) => {
  if (isDM || (type === 'pjs' && id === currentPlayer?.id)) setForm({ type, id })
},
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`. Log in as a player. Navigate to your own PJ. The "Editar" button does not exist yet (that's Task 2), but the permission logic is now correct. No console errors.

---

## Task 2: Add "Editar" button for own player in PJDetail

**Files:**
- Modify: `src/pages/pj/PJDetail.jsx:33-101`

- [ ] **Step 1: Import `currentPlayer` from context**

In `src/pages/pj/PJDetail.jsx`, line 34:
```js
const { isDM } = useApp()
```
Replace with:
```js
const { isDM, currentPlayer } = useApp()
```

- [ ] **Step 2: Compute `isOwnPlayer` and add the button**

After line 34 (after the `useApp()` destructure), add:
```js
const isOwnPlayer = !isDM && currentPlayer?.id === pj.id
```

Then find lines 93–101 (the `{isDM && ...}` block in the back bar):
```jsx
{isDM && (
  <div className="flex items-center gap-2">
    <span className={articleLink} title="ID para wiki-link">
      {`{${pj.id}${COLLECTION_LETTER['pjs']}}`}
    </span>
    <button className={btnSecondary} onClick={onDelete}>Eliminar</button>
    <button className={btnSecondary} onClick={onEdit}>Editar</button>
  </div>
)}
```
Replace with:
```jsx
{isDM && (
  <div className="flex items-center gap-2">
    <span className={articleLink} title="ID para wiki-link">
      {`{${pj.id}${COLLECTION_LETTER['pjs']}}`}
    </span>
    <button className={btnSecondary} onClick={onDelete}>Eliminar</button>
    <button className={btnSecondary} onClick={onEdit}>Editar</button>
  </div>
)}
{isOwnPlayer && (
  <button className={btnSecondary} onClick={onEdit}>Editar</button>
)}
```

- [ ] **Step 3: Verify manually**

`npm run dev`. Log in as a player, navigate to their own PJ detail. The "Editar" button now appears. Clicking it should open the form modal (may show all tabs still — that's fixed in Task 3).

---

## Task 3: Restrict form tabs and actions in PJForm

**Files:**
- Modify: `src/pages/pj/PJForm.jsx:8-194`

- [ ] **Step 1: Import `currentPlayer` from context**

In `src/pages/pj/PJForm.jsx`, line 15:
```js
const { save, remove, closeForm, isDM } = useApp()
```
Replace with:
```js
const { save, remove, closeForm, isDM, currentPlayer } = useApp()
```

- [ ] **Step 2: Compute `isOwnPlayer`**

Immediately after the `useApp()` line, add:
```js
const isOwnPlayer = !isDM && currentPlayer?.id === item?.id
```

- [ ] **Step 3: Make TABS conditional**

Find lines 8–12 (the `TABS` constant):
```js
const TABS = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'mecanicas', label: 'Mecánicas' },
  { id: 'inventario', label: 'Equipo & Rasgos' },
]
```
This is a module-level constant, so it cannot reference `isOwnPlayer`. Move TABS inside the component (just after the `isOwnPlayer` line):
```js
const TABS = [
  { id: 'identidad', label: 'Identidad' },
  ...(!isOwnPlayer ? [
    { id: 'mecanicas', label: 'Mecánicas' },
    { id: 'inventario', label: 'Equipo & Rasgos' },
  ] : []),
]
```
Delete the module-level `TABS` constant at the top of the file.

- [ ] **Step 4: Hide the Eliminar button for own-player edits**

Find the footer buttons (around line 188):
```jsx
{item && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
```
Replace with:
```jsx
{item && !isOwnPlayer && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
```

- [ ] **Step 5: Pass `isOwnPlayer` to PJIdentityTab**

Find the `PJIdentityTab` render (around line 176):
```jsx
<PJIdentityTab
  f={f} setF={setF} isDM={isDM} item={item}
  newPlayerPwd={newPlayerPwd} setNewPlayerPwd={setNewPlayerPwd}
  showPlayerPwd={showPlayerPwd} setShowPlayerPwd={setShowPlayerPwd}
  accessStatus={accessStatus} handleResetAccess={handleResetAccess}
/>
```
Replace with:
```jsx
<PJIdentityTab
  f={f} setF={setF} isDM={isDM} item={item}
  isOwnPlayer={isOwnPlayer}
  newPlayerPwd={newPlayerPwd} setNewPlayerPwd={setNewPlayerPwd}
  showPlayerPwd={showPlayerPwd} setShowPlayerPwd={setShowPlayerPwd}
  accessStatus={accessStatus} handleResetAccess={handleResetAccess}
/>
```

- [ ] **Step 6: Verify manually**

`npm run dev`. Log in as player, click Editar on their PJ. Modal opens showing only the "Identidad" tab. No "Eliminar" button visible. DM login shows all three tabs and the Eliminar button as before.

---

## Task 4: Hide Nivel, Experiencia, and EstadoField in PJIdentityTab

**Files:**
- Modify: `src/pages/pj/form/PJIdentityTab.jsx:15-96`

- [ ] **Step 1: Add `isOwnPlayer` to props**

Line 15:
```js
export default function PJIdentityTab({ f, setF, isDM, item, newPlayerPwd, setNewPlayerPwd, showPlayerPwd, setShowPlayerPwd, accessStatus, handleResetAccess }) {
```
Replace with:
```js
export default function PJIdentityTab({ f, setF, isDM, item, isOwnPlayer, newPlayerPwd, setNewPlayerPwd, showPlayerPwd, setShowPlayerPwd, accessStatus, handleResetAccess }) {
```

- [ ] **Step 2: Hide Nivel input**

Find the FormRow containing Nivel and Región de Origen (lines 33–43):
```jsx
<FormRow>
  <div>
    <label className={labelCls}>Nivel</label>
    <input className={inputCls} type="number" value={f.nivel} onChange={set('nivel')} min="1" max="20" />
  </div>
  <div>
    <label className={labelCls}>Región de Origen</label>
    <select className={inputCls} value={f.region} onChange={set('region')}>
      {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
    </select>
  </div>
</FormRow>
```
Replace with:
```jsx
<FormRow>
  {!isOwnPlayer && (
    <div>
      <label className={labelCls}>Nivel</label>
      <input className={inputCls} type="number" value={f.nivel} onChange={set('nivel')} min="1" max="20" />
    </div>
  )}
  <div>
    <label className={labelCls}>Región de Origen</label>
    <select className={inputCls} value={f.region} onChange={set('region')}>
      {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
    </select>
  </div>
</FormRow>
```

- [ ] **Step 3: Hide Experiencia input**

Find the FormRow containing Experiencia and Imagen (lines 44–52):
```jsx
<FormRow>
  <div><label className={labelCls}>Experiencia (XP)</label><input className={inputCls} type="number" value={f.experiencia} onChange={set('experiencia')} min="0" /></div>
  <div className="flex items-end">
    <div className="w-full">
      <label className={labelCls}>Imagen (URL externa)</label>
      <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
    </div>
  </div>
</FormRow>
```
Replace with:
```jsx
<FormRow>
  {!isOwnPlayer && (
    <div><label className={labelCls}>Experiencia (XP)</label><input className={inputCls} type="number" value={f.experiencia} onChange={set('experiencia')} min="0" /></div>
  )}
  <div className="flex items-end">
    <div className="w-full">
      <label className={labelCls}>Imagen (URL externa)</label>
      <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
    </div>
  </div>
</FormRow>
```

- [ ] **Step 4: Hide EstadoField for non-DM**

Find line 93:
```jsx
<EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
```
Replace with:
```jsx
{isDM && <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />}
```

- [ ] **Step 5: Verify manually — player view**

`npm run dev`. Log in as player. Open Editar on their PJ. In the Identidad tab verify:
- Nivel input is **not visible**
- Experiencia input is **not visible**
- Notas del DM textarea is **not visible**
- EstadoField (estado select + visibilidad checkboxes) is **not visible**
- All other fields (Nombre, Jugador, Clase, Raza, Trasfondo D&D, Alineamiento, Región, Imagen, physical appearance, personality, narrative) **are visible and editable**

- [ ] **Step 6: Verify DM view is unchanged**

Log in as DM. Open Editar on any PJ. Verify:
- All three tabs visible (Identidad, Mecánicas, Equipo & Rasgos)
- Nivel and Experiencia visible in Identidad tab
- Notas del DM visible
- EstadoField visible
- Eliminar button visible

- [ ] **Step 7: Verify save preserves DM fields**

As player, edit a field (e.g. Apariencia), save. Then log in as DM and confirm the PJ's Nivel, Experiencia, estado, and visibilidad are unchanged.

---

## Task 5: Commit

- [ ] **Step 1: Commit all changes**

```bash
git add src/App.jsx src/pages/pj/PJDetail.jsx src/pages/pj/PJForm.jsx src/pages/pj/form/PJIdentityTab.jsx docs/superpowers/specs/2026-05-25-player-edit-identity-design.md docs/superpowers/plans/2026-05-25-player-edit-identity.md
git commit -m "feat: allow players to edit identity fields of their own PJ"
```
