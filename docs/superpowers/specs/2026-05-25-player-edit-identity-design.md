# Spec: Player Self-Edit of PJ Identity

**Date:** 2026-05-25  
**Branch:** UI-Update

## Summary

Allow each player to edit the Identity fields of their own PJ via the existing form modal, excluding fields controlled by the DM (Nivel, Experiencia, Notas del DM, EstadoField).

## Scope

- Players can open and save the Identity tab of their own PJ.
- No other entity types are editable by players.
- Players cannot delete their PJ.
- The other tabs (Mecánicas, Equipo & Rasgos) remain DM-only.

## Files to Modify

| File | Change |
|------|--------|
| `src/App.jsx` | Extend `openForm` to allow player to open their own PJ |
| `src/pages/pj/PJDetail.jsx` | Show Editar button to the player viewing their own PJ |
| `src/pages/pj/PJForm.jsx` | Compute `isOwnPlayer`; restrict tabs and hide Eliminar button |
| `src/pages/pj/form/PJIdentityTab.jsx` | Hide Nivel, Experiencia, EstadoField when `isOwnPlayer` |

## Detailed Design

### 1. `App.jsx` — openForm permission

```js
openForm: (type, id = null) => {
  if (isDM || (type === 'pjs' && id === currentPlayer?.id)) setForm({ type, id })
}
```

`currentPlayer` is already in context. No other changes needed here.

### 2. `PJDetail.jsx` — Editar button for own player

```jsx
const { isDM, currentPlayer } = useApp()
const isOwnPlayer = !isDM && currentPlayer?.id === pj.id

{isDM && (
  <div className="flex items-center gap-2">
    <span ...>{wiki-link id}</span>
    <button onClick={onDelete}>Eliminar</button>
    <button onClick={onEdit}>Editar</button>
  </div>
)}
{isOwnPlayer && (
  <button className={btnSecondary} onClick={onEdit}>Editar</button>
)}
```

### 3. `PJForm.jsx` — Restrict tabs and actions

Compute inside the component:
```js
const { save, remove, closeForm, isDM, currentPlayer } = useApp()
const isOwnPlayer = !isDM && currentPlayer?.id === item?.id
```

Filter tabs:
```js
const TABS = [
  { id: 'identidad', label: 'Identidad' },
  ...(!isOwnPlayer ? [
    { id: 'mecanicas', label: 'Mecánicas' },
    { id: 'inventario', label: 'Equipo & Rasgos' },
  ] : []),
]
```

Hide Eliminar button:
```jsx
{item && !isOwnPlayer && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
```

Pass `isOwnPlayer` to `PJIdentityTab`:
```jsx
<PJIdentityTab ... isOwnPlayer={isOwnPlayer} />
```

### 4. `PJIdentityTab.jsx` — Hide DM-controlled fields

Add `isOwnPlayer` to props. Apply conditionally:

- **Nivel**: hide the entire `<div>` containing the Nivel input when `isOwnPlayer`. The Región de Origen sibling div remains and occupies the full row.
- **Experiencia**: hide the Experiencia `<div>` when `isOwnPlayer`. The Imagen (URL) sibling div remains.
- **EstadoField**: render only when `isDM` (change from always-shown to `{isDM && <EstadoField ... />}`).

Notas del DM is already gated on `{isDM && ...}` — no change needed.

## Constraints

- Players can only edit their own PJ — enforced at two layers: `openForm` guard in context, and `isOwnPlayer` computation in `PJForm`.
- `handleSave` in `PJForm` is unchanged: it spreads all fields and saves. DM-controlled fields (Nivel, Experiencia, estado, visibilidad) are initialized from `item` in `useState` and will be preserved in the saved data even though the player cannot see or edit them.
- No new components are created.
