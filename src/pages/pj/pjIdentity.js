/**
 * The identity tag of a character ("Paladín - Nv. 5") under the campaign's system document: only the built-ins that
 * are on take part, the stock "Nivel" keeps the short "Nv." and a renamed level shows its own name ("Rango 5").
 * Returns '' when both are off.
 *
 * @param {{ clase?: string, nivel?: number }} pj
 * @param {{ clase: { enabled: boolean }, nivel: { enabled: boolean, label: string } }} builtins
 */
export function identityTag(pj, builtins) {
  const parts = []
  if (builtins.clase.enabled) parts.push(pj.clase || '?')
  if (builtins.nivel.enabled) parts.push(builtins.nivel.label === 'Nivel' ? `Nv. ${pj.nivel || 1}` : `${builtins.nivel.label} ${pj.nivel || 1}`)
  return parts.join(' - ')
}
