import { createContext, useContext } from 'react'
import type { ActionCollectionRepository } from '../../../data'

/**
 * What the character editor needs to link collection entries. Provided by the hub form host only when the editor is drawn from a
 * sheet; absent (null) everywhere else, so the legacy forms and the unit-rendered editor have no link panel.
 */
export interface ActionLinksPort {
  actions: ActionCollectionRepository
  campaignId: string
}

export const ActionLinksContext = createContext<ActionLinksPort | null>(null)

export const useActionLinks = (): ActionLinksPort | null => useContext(ActionLinksContext)
