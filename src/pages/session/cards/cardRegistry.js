import SessionCardStats from './SessionCardStats'
import SessionCardSkills from './SessionCardSkills'
import SessionCardWeapons from './SessionCardWeapons'
import SessionCardSpells from './SessionCardSpells'
import SessionCardInventory from './SessionCardInventory'
import SessionCardResources from './SessionCardResources'
import SessionCardInspiration from './SessionCardInspiration'
import SessionCardNotes from './SessionCardNotes'
import SessionCardRules from './SessionCardRules'
import SessionCardCombat from './SessionCardCombat'

// tipo -> { label, Component, editable }
// `editable: true` cards render a per-PJ "Editar" button (wired to
// SessionEditModal in Phase 3); `editable: false` cards (notes, rules, combat)
// manage their own persistence directly and have no scoped edit modal.
export const CARD_REGISTRY = {
  stats: { label: 'Stats', Component: SessionCardStats, editable: true },
  skills: { label: 'Habilidades', Component: SessionCardSkills, editable: true },
  weapons: { label: 'Armas', Component: SessionCardWeapons, editable: true },
  spells: { label: 'Hechizos', Component: SessionCardSpells, editable: true },
  inventory: { label: 'Inventario', Component: SessionCardInventory, editable: true },
  resources: { label: 'Recursos', Component: SessionCardResources, editable: true },
  inspiration: { label: 'Inspiración', Component: SessionCardInspiration, editable: true },
  notes: { label: 'Notas', Component: SessionCardNotes, editable: false },
  rules: { label: 'Reglas', Component: SessionCardRules, editable: false },
  combat: { label: 'Combate', Component: SessionCardCombat, editable: false },
}
