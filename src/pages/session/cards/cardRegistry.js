import SessionCardStats from './SessionCardStats'
import SessionCardSkills from './SessionCardSkills'
import SessionCardWeapons from './SessionCardWeapons'
import SessionCardSpells from './SessionCardSpells'
import SessionCardInventory from './SessionCardInventory'
import SessionCardInspiration from './SessionCardInspiration'
import SessionCardHpAc from './SessionCardHpAc'
import SessionCardNotes from './SessionCardNotes'
import SessionCardRules from './SessionCardRules'

// tipo -> { label, Component, editable }
// `editable: true` cards render a per-PJ "Editar" button (wired to
// SessionEditModal in Phase 3); `editable: false` cards (notes, rules) manage
// their own persistence directly and have no scoped edit modal.
export const CARD_REGISTRY = {
  stats: { label: 'Stats', Component: SessionCardStats, editable: true },
  skills: { label: 'Habilidades', Component: SessionCardSkills, editable: true },
  weapons: { label: 'Armas', Component: SessionCardWeapons, editable: true },
  spells: { label: 'Hechizos', Component: SessionCardSpells, editable: true },
  inventory: { label: 'Inventario', Component: SessionCardInventory, editable: true },
  inspiration: { label: 'Inspiración', Component: SessionCardInspiration, editable: true },
  'hp-ac': { label: 'HP y AC', Component: SessionCardHpAc, editable: true },
  notes: { label: 'Notas', Component: SessionCardNotes, editable: false },
  rules: { label: 'Reglas', Component: SessionCardRules, editable: false },
}
