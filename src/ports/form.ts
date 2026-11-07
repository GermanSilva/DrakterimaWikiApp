import { createContext, useContext, type MutableRefObject } from 'react'
import type { Sheet } from '../campaign/system/sheet/sheetModel'
import { DND5E_PROFILE, type SystemProfile } from '../campaign/system/systemProfile'

export interface Region {
  key: string
  label: string
  color?: string
}

export interface CharacterRef {
  id: number
  nombre: string
  jugador?: string | null
}

/** The slice of a sesión the session forms need to compute ordering. */
export interface SesionRef {
  id: number
  numero?: number | null
  orden?: number | null
  tipo?: string | null
  titulo?: string
}

/** A campaign-defined character field (text). `flat`: the legacy app stores it directly on the document. */
export interface CharacterField {
  key: string
  label: string
  flat?: boolean
}

/**
 * Read-only data the entity forms need that is NOT part of the entity being edited. The host app
 * installs an adapter (legacy: db + helpers, hub: campaign regions + characters + sesiones).
 */
export interface FormPort {
  isDM: boolean
  regions: Region[]
  /** Characters offered in the "visible para" checklist of EstadoField. */
  characters: CharacterRef[]
  sesiones: SesionRef[]
  /** Characters the viewer owns (a player's own PJ): the PJ form shows only the identity tab for them. */
  ownCharacterIds?: readonly number[]
  /** Extra character fields to offer in the PJ form (default: none). */
  characterFields?: readonly CharacterField[]
  /** Label of the narrative `motivo` field (default "Motivación"; the legacy Drakterima app keeps its guild wording). */
  motivoLabel?: string
  /** The system document of the campaign (character built-ins and sheet blocks). Absent = the D&D 5e document (legacy app). */
  system?: Readonly<SystemProfile>
  /** Hub, whenever the campaign has a valid stored sheet: the character editor is drawn from this sheet instead of the fixed D&D form. */
  sheet?: Sheet
  /** Hub: `jugador` follows the DM's assignment of the character (the database derives it), so the form shows it read-only. Legacy: typed by hand. */
  jugadorFromAssignment?: boolean
  /** Legacy only: the password-based player access of the Firebase app (hub: false, replaced by Auth). */
  playerAccess?: boolean
}

export const FormPortContext = createContext<FormPort | null>(null)

export function useFormPort(): FormPort {
  const port = useContext(FormPortContext)
  if (!port) throw new Error('useFormPort must be used inside a FormPortContext provider (legacy or hub adapter)')
  return port
}

/** The system document the forms follow (D&D 5e when the host installs none). */
export function useFormSystem(): Readonly<SystemProfile> {
  return useFormPort().system ?? DND5E_PROFILE
}

export function regionLabelOf(regions: Region[], key: string | null | undefined): string {
  return regions.find((r) => r.key === key)?.label ?? (key ?? '')
}

/** Last focused wiki-capable textarea, used by the "Insertar enlace" picker. */
export interface ActiveField {
  el: HTMLTextAreaElement | HTMLInputElement
  setter: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  key: string
}

/** Actions a form calls: provided by the FormShell that hosts it (legacy passes useApp's, hub its own). */
export interface FormActions {
  save(type: string, data: Record<string, unknown>): void | Promise<void>
  remove(type: string, id: number): void | Promise<void>
  closeForm(): void
  /** True while a save is in flight (the Guardar button disables itself). */
  saving?: boolean
  activeFieldRef: MutableRefObject<ActiveField | null>
}

export const FormActionsContext = createContext<FormActions | null>(null)

export function useFormActions(): FormActions {
  const actions = useContext(FormActionsContext)
  if (!actions) throw new Error('useFormActions must be used inside a <FormShell>')
  return actions
}
