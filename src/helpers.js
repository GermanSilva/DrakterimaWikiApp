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

export function DateTimeFormat(date) {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} - ${hours}:${minutes}`
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

export function plainText(text) {
  if (!text) return ''
  return text
    .replace(/\[\[https?:\/\/[^\]]*\]\]/g, '')           // strip inline images
    .replace(/\[\[\{\d+[A-Z]\}([^\]]*)\]\]/g, '$1')      // valid wikilinks → display text
    .replace(/\[\[\{\d+\}([^\]]*)\]\]/g, '$1')            // invalid wikilinks → display text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')                // bold-italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')                    // bold
    .replace(/\*([^*]+)\*/g, '$1')                        // italic
    .replace(/^#{1,3} /gm, '')                            // headings
    .replace(/^[-*] /gm, '')                              // unordered list markers
    .replace(/^\d+\. /gm, '')                             // ordered list markers
    .replace(/^---$/gm, '')                               // horizontal rules
    .replace(/\n+/g, ' ')
    .trim()
}
