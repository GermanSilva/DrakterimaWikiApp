# Habilidades — nuevo tipo en nivel de hechizos de PJ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar "Habilidades" como tercer tipo de clasificación en la sección de hechizos de fichas de PJ, representado internamente como `nivel = 10`.

**Architecture:** Tres archivos afectados: formulario inline (`SpellsCRUD`), vista de detalle (`PJSpellsSection`), y modal de detalle (`SpellDetailModal`). El valor `nivel = 10` es el sentinela para habilidades — retrocompatible sin cambios de schema.

**Tech Stack:** React 18, Vite 5. Sin test runner.

---

### Task 1: SpellsCRUD — agregar "Habilidad" al selector de nivel

**Files:**
- Modify: `src/pages/pj/form/SpellsCRUD.jsx`

- [ ] **Step 1: Actualizar LEVELS y LEVEL_LABELS**

En `src/pages/pj/form/SpellsCRUD.jsx`, líneas 10–11, cambiar:

```js
const LEVELS = ['Truco (0)', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const LEVEL_LABELS = ['Trucos', 'Niv 1', 'Niv 2', 'Niv 3', 'Niv 4', 'Niv 5', 'Niv 6', 'Niv 7', 'Niv 8', 'Niv 9']
```

por:

```js
const LEVELS = ['Truco (0)', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Habilidad']
const LEVEL_LABELS = ['Trucos', 'Niv 1', 'Niv 2', 'Niv 3', 'Niv 4', 'Niv 5', 'Niv 6', 'Niv 7', 'Niv 8', 'Niv 9', 'Habilidades']
```

El select ya itera con `{LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}`, por lo que el índice 10 produce automáticamente `value={10}` y el texto "Habilidad".

- [ ] **Step 2: Commit**

```bash
git add src/pages/pj/form/SpellsCRUD.jsx
git commit -m "feat: agregar Habilidad como opción de nivel en SpellsCRUD"
```

---

### Task 2: PJSpellsSection — mostrar habilidades siempre como activas

**Files:**
- Modify: `src/pages/pj/detail/PJSpellsSection.jsx`

- [ ] **Step 1: Agregar Habilidades a SPELL_LEVELS y actualizar isPrepared**

En `src/pages/pj/detail/PJSpellsSection.jsx`, línea 5, cambiar:

```js
const SPELL_LEVELS = ['Trucos', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6', 'Nivel 7', 'Nivel 8', 'Nivel 9']
```

por:

```js
const SPELL_LEVELS = ['Trucos', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6', 'Nivel 7', 'Nivel 8', 'Nivel 9', 'Habilidades']
```

Luego, en línea 64, cambiar:

```js
const isPrepared = h.preparado || Number(h.nivel) === 0
```

por:

```js
const isPrepared = h.preparado || Number(h.nivel) === 0 || Number(h.nivel) === 10
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/pj/detail/PJSpellsSection.jsx
git commit -m "feat: habilidades (nivel 10) siempre activas en PJSpellsSection"
```

---

### Task 3: SpellDetailModal — etiqueta correcta para habilidades

**Files:**
- Modify: `src/pages/pj/detail/SpellDetailModal.jsx`

- [ ] **Step 1: Actualizar levelLabel**

En `src/pages/pj/detail/SpellDetailModal.jsx`, línea 5, cambiar:

```js
const levelLabel = Number(spell.nivel) === 0 ? 'Truco' : `Nivel ${spell.nivel}`
```

por:

```js
const levelLabel = Number(spell.nivel) === 0 ? 'Truco' : Number(spell.nivel) === 10 ? 'Habilidad' : `Nivel ${spell.nivel}`
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/pj/detail/SpellDetailModal.jsx
git commit -m "feat: etiqueta Habilidad en SpellDetailModal para nivel 10"
```

---

### Task 4: Squash de commits

- [ ] **Step 1: Obtener SHA base (antes del primer commit de esta feature)**

```bash
git log --oneline -5
```

Identificar el SHA del commit inmediatamente anterior al primer commit de esta feature (el commit del spec: `docs: spec habilidades...`).

- [ ] **Step 2: Squash**

```bash
git reset --soft <sha-base>
```

- [ ] **Step 3: Commit único final**

```bash
git commit -m "feat: habilidades como nuevo tipo de clasificación en hechizos de PJ"
```
