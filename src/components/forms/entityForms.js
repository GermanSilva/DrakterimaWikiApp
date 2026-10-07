import SesionForm from './SesionForm'
import AvanceForm from './AvanceForm'
import PNJForm from './PNJForm'
import LugarForm from './LugarForm'
import FaccionForm from './FaccionForm'
import LoreForm from './LoreForm'
import ItemForm from './ItemForm'
import HomeruleForm from './HomeruleForm'

/**
 * Form components of the wiki entities whose only collaborators are the form ports
 * (`useFormActions` / `useFormPort`): both the legacy FormModal and the hub's EntityFormHost use them.
 * Keyed by form type (`avances` edits a `sesiones` row with tipo 'avance').
 */
export const ENTITY_FORMS = {
  sesiones: SesionForm,
  avances: AvanceForm,
  pnjs: PNJForm,
  lugares: LugarForm,
  facciones: FaccionForm,
  lore: LoreForm,
  items: ItemForm,
  homebrew_rules: HomeruleForm,
}

/** Modal titles per form type: [create, edit]. */
export const FORM_TITLES = {
  sesiones: ['Nueva Sesión', 'Editar Sesión'],
  avances: ['Nuevo Avance', 'Editar Avance'],
  pnjs: ['Nuevo PNJ', 'Editar PNJ'],
  lugares: ['Nuevo Lugar', 'Editar Lugar'],
  facciones: ['Nueva Facción', 'Editar Facción'],
  lore: ['Nueva Entrada de Lore', 'Editar Lore'],
  items: ['Nuevo Ítem', 'Editar Ítem'],
  mapas: ['Nuevo Mapa', 'Editar Mapa'],
  map_points: ['Nuevo Punto', 'Editar Punto'],
  disponibilidad: ['Nueva disponibilidad', 'Editar disponibilidad'],
  homebrew_rules: ['Nueva Regla Homebrew', 'Editar Regla Homebrew'],
}
