const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Gold of a session slot (grid badge and day timeline). */
export const SESION_COLOR = '#d4af37'

/** `2026-03-06` -> `Viernes 06/03/2026`. */
export function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return `${DIAS_LARGO[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}
