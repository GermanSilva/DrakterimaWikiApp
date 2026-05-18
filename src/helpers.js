export const regionLabel = {
  magral: 'Magral',
  nezor: 'Nezor',
  heladas: 'Tierras Heladas',
  islas: 'Islas Pétreas',
  otro: 'Otro',
}

export const regionOptions = ['magral', 'nezor', 'heladas', 'islas', 'otro']

export const relacionLabel = {
  aliado: 'Aliado',
  neutral: 'Neutral',
  enemigo: 'Enemigo',
  desconocido: 'Desconocido',
}

export function isVisible(entity, isDM, currentPlayer) {
  if (isDM) return true
  const estado = entity.estado ?? 'publicado'
  if (estado === 'borrador') return false
  if (estado === 'publicado') return true
  // secreto
  if (!currentPlayer) return false
  return (entity.visibilidad ?? []).includes(currentPlayer.id)
}

export function nextId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1
}

export function nl2br(text) {
  return { __html: (text || '').replace(/\n/g, '<br>') }
}
