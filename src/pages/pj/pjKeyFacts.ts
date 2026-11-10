import { formatNumber } from '../../campaign/system/sheet/resolveSheet'
import { roleValues } from '../../campaign/system/sheet/roles'
import type { Sheet } from '../../campaign/system/sheet/sheetModel'
import type { KeyFact } from '../../campaign/system/sheet/card'

export type { KeyFact }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const ratioOf = (current: number, max: number) => (max > 0 ? Math.min(1, Math.max(0, current / max)) : 0)

/**
 * The bound roles of a character, in a fixed order (HP, CA, Vel., Init.), then the level when the system uses one.
 * HP is "current / max" with a bar when both roles are bound; an unbound role or one without a value leaves no gap.
 */
export function roleFacts(sheet: Sheet | null, pj: Record<string, unknown>, level?: { enabled: boolean; label: string }): KeyFact[] {
  const roles = roleValues(sheet, pj)
  const facts: KeyFact[] = []
  const hp = finite(roles.hp) ? roles.hp : undefined
  const current = finite(roles.hp_current) ? roles.hp_current : undefined
  if (hp !== undefined && current !== undefined) facts.push({ key: 'hp', label: 'HP', value: formatNumber(current), max: formatNumber(hp), ratio: ratioOf(current, hp) })
  else if (hp !== undefined || current !== undefined) facts.push({ key: 'hp', label: 'HP', value: formatNumber((hp ?? current) as number) })
  if (finite(roles.ac)) facts.push({ key: 'ac', label: 'CA', value: formatNumber(roles.ac) })
  if (finite(roles.speed)) facts.push({ key: 'speed', label: 'Vel.', value: formatNumber(roles.speed) })
  if (finite(roles.initiative)) facts.push({ key: 'initiative', label: 'Init.', value: formatNumber(roles.initiative, 'signed') })
  if (level?.enabled && finite(pj.nivel)) facts.push({ key: 'nivel', label: level.label, value: formatNumber(pj.nivel) })
  return facts
}
