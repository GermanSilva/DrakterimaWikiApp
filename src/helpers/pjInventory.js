export const TO_CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }

/**
 * Value of equipment + weapons in copper (D&D 5e rates). Prices and quantities are whole numbers
 * (`parseInt`, like the forms) and never negative. An item without a (positive) price counts for nothing; a
 * missing or unparsable quantity is 1, but an explicit 0 really is 0.
 */
export function calcTotalCP(equipo, ataques) {
  return [...equipo, ...ataques].reduce((sum, item) => {
    const precio = Math.max(0, parseInt(item.precio) || 0)
    if (!precio) return sum
    const parsed = parseInt(item.cantidad)
    const cantidad = Number.isNaN(parsed) ? 1 : Math.max(0, parsed)
    const rate = TO_CP[item.precio_moneda] ?? TO_CP.gp
    return sum + precio * cantidad * rate
  }, 0)
}

/** "2 platino 3 oro 5 bronce" from copper (electrum is not shown), or null for zero (or less). */
export function formatTotalCP(totalCp) {
  if (!(totalCp > 0)) return null
  const parts = []
  let rem = totalCp
  const denoms = [
    { val: 1000, label: 'platino' },
    { val: 100, label: 'oro' },
    { val: 10, label: 'plata' },
    { val: 1, label: 'bronce' },
  ]
  for (const d of denoms) {
    const n = Math.floor(rem / d.val)
    if (n > 0) { parts.push(`${n} ${d.label}`); rem -= n * d.val }
  }
  return parts.join(' ')
}
