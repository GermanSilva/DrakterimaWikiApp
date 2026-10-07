import type { FlatEntity } from '../data'
import type { UnreadPort } from '../ports'
import { changedPjSections } from '../helpers/pjSections'
import { STAMPABLE_SECTIONS } from './pjOwnerFields'

export interface SectionStamps {
  sections: string[]
  /** `{ [section]: ISO time }`: merged into `pjs.sections_updated`. */
  stamps: Record<string, string>
}

/**
 * Sections of a character a save changes, stamped with the time of the write. DM notes and visibility are
 * NOT stamped: `sections_updated` is readable by every member, so a "dm" stamp would tell players when the DM
 * edited a note (the hub derives that dot from the DM-only notes row), and a visibility change is no content change.
 */
export function pjSectionStamps(entity: FlatEntity, patch: Record<string, unknown>): SectionStamps {
  const sections = (changedPjSections(entity, { ...entity, ...patch }) as string[]).filter((k) => STAMPABLE_SECTIONS.includes(k))
  const now = new Date().toISOString()
  return { sections, stamps: Object.fromEntries(sections.map((k) => [k, now])) }
}

/** The saver has seen their own change: clear the dots of the sections it stamped. */
export function markSectionsSeen(unread: UnreadPort, id: number, { sections, stamps }: SectionStamps): void {
  for (const section of sections) {
    try {
      unread.markRead('pjs', id, stamps[section], section)
    } catch (err) {
      console.error('No se pudo marcar como leído', err)
    }
  }
}
