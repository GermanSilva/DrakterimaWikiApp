# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, localhost:5173)
npm run build     # Production build
npm run preview   # Preview production build
```

No test runner is configured.

## Architecture

**dragones-wiki** is a single-page TTRPG campaign wiki for a D&D campaign called "Drakterima". It's a pure client-side React + Vite app with no backend — all data persists in `localStorage` under the key `drakterima_wiki_v1`.

### Data flow

`App.jsx` owns all state: `db` (the data object), `page` (current view), `detail` (open detail panel), `form` (open form modal), and `toastMsg`. All mutations go through `save(type, data)` and `remove(type, id)`, which write to both React state and `localStorage` atomically via `persistDb()`.

`AppContext.jsx` exposes the context; all child components consume it via `useApp()`. No external state library is used.

### Data schema (`seed.js`)

The `db` object has seven collections: `sesiones`, `pjs`, `pnjs`, `lugares`, `facciones`, `lore`, `items`. Each item has a numeric `id` assigned by `nextId()` (max existing id + 1).

- `defaultData` in `seed.js` has pre-seeded `lugares`, `facciones`, and `lore`.
- `seedPJs`, `seedPNJs`, `seedSesiones` are injected on first load if those collections are empty.
- On load, `Object.assign(base, JSON.parse(raw))` merges saved data over defaults, meaning default items are preserved even if localStorage has data for other collections.

### UI layout

Three-column layout: `Header` (top bar) → `Sidebar` (left nav with counts) → `main` (current page). Overlays: `DetailPanel` (slide-in right panel for reading records) and `FormModal` (centered modal for create/edit). Both use the same dispatch pattern: `openDetail(type, id)` / `openForm(type, id)`.

`DetailPanel` and `FormModal` each use a `{ type → Component }` map (`DETAIL_VIEWS`, `FORM_COMPONENTS`) — adding a new entity type requires adding entries in both maps, a page component under `src/pages/`, a nav entry in `Sidebar`, and a key in the `PAGES` map in `App.jsx`.

### DM-only fields

Several entity types have private/DM fields (`notas`, `secreto`) that are visually distinguished in `DetailPanel` using `var(--accent)` / `var(--accent-bright)` CSS variables and a lock icon. This is purely cosmetic — there is no auth layer.

### Helpers (`helpers.js`)

- `regionLabel` / `regionOptions`: canonical region values (`magral`, `nezor`, `heladas`, `islas`, `otro`).
- `relacionLabel`: canonical relation values (`aliado`, `neutral`, `enemigo`, `desconocido`).
- `nextId(arr)`: increments max id.
- `nl2br(text)`: converts `\n` to `<br>` for `dangerouslySetInnerHTML` rendering.

### Styling

All styles are in `src/styles.css`. Uses CSS custom properties (`--accent`, `--text-muted`, etc.) for theming. No CSS framework or CSS-in-JS.
