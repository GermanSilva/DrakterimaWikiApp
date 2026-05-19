export function abilityMod(base) {
  const n = Math.floor(((base ?? 10) - 10) / 2)
  return n >= 0 ? `+${n}` : `${n}`
}

export function abilityModNum(base) {
  return Math.floor(((base ?? 10) - 10) / 2)
}

export function signedBonus(n) {
  const num = n ?? 0
  return num >= 0 ? `+${num}` : `${num}`
}

export function suggestedProfBonus(nivel) {
  if (nivel <= 4) return 2
  if (nivel <= 8) return 3
  if (nivel <= 12) return 4
  if (nivel <= 16) return 5
  return 6
}

export function passivePerception(pj) {
  const wisModNum = abilityModNum(pj.stat_wis)
  const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
  const skillPerc = pj.skill_perception ?? 0
  return 10 + wisModNum + (skillPerc > 0 ? profBonus : 0) + (skillPerc > 1 ? profBonus : 0)
}
