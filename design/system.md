# Design system (synced from project sources)

Sources read: `src/styles.css`, `tailwind.config.js`, `src/constants.js` (component classes).
Values below are only those found in the sources.

## Colors

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `bg-deep` | `#060606` | page background (`body`) | tailwind.config.js, src/styles.css |
| `bg-mid` | `#0b0b0b` | inputs | tailwind.config.js |
| `bg-card` | `#111111` | cards | tailwind.config.js |
| `bg-card-hover` | `#171717` | card hover | tailwind.config.js |
| `border-base` | `#1e1e1e` | default borders, dividers | tailwind.config.js |
| `border-light` | `#282828` | secondary button border, scrollbar | tailwind.config.js |
| `accent` / `--accent` | `#dc2626` (`220 38 38`) | primary buttons; campaigns override it | src/styles.css |
| `accent-bright` | `239 68 68` (`#ef4444`) | hover, error text | src/styles.css |
| `accent-dim` | `153 27 27` (`#991b1b`) | input focus border | src/styles.css |
| `accent-subtle` | `69 10 10` (`#450a0a`) | subtle fills | src/styles.css |
| `txt-primary` | `#ececec` | body text | tailwind.config.js |
| `txt-secondary` | `#888888` | secondary text | tailwind.config.js |
| `txt-muted` | `#6e6e6e` | labels, hints | tailwind.config.js |
| `--brand-1` | `#9c2d8c` | RPG Quester brand gradient stop | src/styles.css |
| `--brand-2` | `#4a32ac` | brand gradient stop | src/styles.css |
| `--brand-3` | `#4aaed8` | brand gradient stop | src/styles.css |
| `--brand-gradient` | `linear-gradient(135deg, brand-1 0%, brand-2 50%, brand-3 100%)` | hub screens: filled accent surfaces (`.hub-surface .bg-accent`), `.brand-gradient-text` | src/styles.css |

Body background adds two faint red radial glows (`rgba(220,38,38,0.05)` / `0.03`) — src/styles.css.

## Typography

| Family | Usage | Source |
| --- | --- | --- |
| `'Exo 2'` (400–700) | headings, labels, buttons — uppercase, wide tracking | tailwind.config.js, src/styles.css |
| `Barlow` (400, 600) | body | src/styles.css |
| `Cinzel` (400, 500) | decorative / fantasy titles | tailwind.config.js |

Scale in use (src/constants.js, src/auth/LoginPage.tsx): page title `text-lg` semibold, tracking `0.15em`, uppercase;
label `10px` medium tracking `0.2em` uppercase; button `11px` semibold tracking `0.1em` uppercase; body `text-sm` (14px); hint `text-xs` (12px).

## Spacing, radius, shadow

- Tailwind default spacing scale; buttons `px-4 py-2`, inputs `px-3 py-2`.
- Radius: none (square corners throughout).
- Shadows: none on components; `unread-dot` glow `0 0 6px rgba(239,68,68,0.65)`.

## Components (src/constants.js)

- **btnPrimary**: Exo 2 11px semibold uppercase, `bg-accent` white text, hover `accent-bright`, no border. On hub screens the fill becomes the brand gradient.
- **btnSecondary**: transparent, `txt-secondary`, 1px `border-light`; hover border `accent-dim`, text `txt-primary`.
- **inputCls**: `bg-mid`, 1px `border-base`, Barlow 14px, focus border `accent-dim`.
- **labelCls**: Exo 2 10px uppercase tracking `0.2em`, `txt-muted`.
- Motion: `card-in`, `fade-in`, `slide-up` (≤0.25s); reduced motion disables shimmer/pulse.
