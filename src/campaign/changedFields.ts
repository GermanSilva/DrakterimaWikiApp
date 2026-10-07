const isEmpty = (v: unknown) => v === undefined || v === null || v === ''

/** The form values that differ from the entity ('' / null / missing count as the same "empty"). */
export function changedFields(entity: Record<string, unknown>, values: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    const current = entity[key]
    if (isEmpty(value) && isEmpty(current)) continue
    if (JSON.stringify(value) === JSON.stringify(current)) continue
    patch[key] = value
  }
  return patch
}

