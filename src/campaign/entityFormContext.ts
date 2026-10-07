import { createContext, useContext } from 'react'
import type { FlatEntity } from '../data'

/** Form types the hub host can open (the wiki entities and the characters; maps and calendar forms come with H8/H9). */
export type EntityFormType = 'sesiones' | 'avances' | 'pjs' | 'pnjs' | 'lugares' | 'facciones' | 'lore' | 'items' | 'homebrew_rules'

export interface EntityFormRequest {
  type: EntityFormType
  /** Entity to edit; omit / null to create. */
  id?: number | null
  /** Called with the saved entity after a successful create/update (before the form closes). */
  onSaved?: (entity: FlatEntity) => void
  /** Called after the entity was deleted from the form. */
  onRemoved?: () => void
}

export interface EntityFormApi {
  /**
   * DM only, except that a player may edit the character they own (a `pjs` form with an id of theirs;
   * the form then shows and saves only the identity fields). Anyone else gets a no-op, like the legacy
   * `openForm`: RLS and the PJ guard stay the real boundary.
   */
  openForm(request: EntityFormRequest): void
  closeForm(): void
}

export const EntityFormContext = createContext<EntityFormApi | null>(null)

/** Opens the shared entity form modal of the current campaign. */
export function useEntityForm(): EntityFormApi {
  const api = useContext(EntityFormContext)
  if (!api) throw new Error('useEntityForm must be used inside <EntityFormProvider> (CampaignLayout mounts it)')
  return api
}

/** `avances` are rows of `sesiones` with tipo 'avance'. */
export const tableOfForm = (type: EntityFormType) => (type === 'avances' ? 'sesiones' : type)
