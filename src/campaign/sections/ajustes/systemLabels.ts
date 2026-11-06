import type { SystemKind, SystemSummary } from '../../../data'

export const KIND_LABEL: Record<SystemKind, string> = {
  origin: 'Sistema Origen',
  homebrew: 'Homebrew',
  frozen: 'Copia congelada',
}

/** «5/10/2026» (the hub reads in es-AR). */
export const systemDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

/** Where a system was branched from, by name when that system is among `known`; null when it has no lineage. */
export function lineageText(system: Pick<SystemSummary, 'branched_from'>, known: readonly Pick<SystemSummary, 'id' | 'name'>[]): string | null {
  if (system.branched_from === null) return null
  const parent = known.find((s) => s.id === system.branched_from)
  return parent ? `Derivado de: ${parent.name}` : 'Derivado de un sistema que ya no está disponible'
}
