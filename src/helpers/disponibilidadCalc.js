// Ventana de un "día" de disponibilidad: 06:00 de `fecha` hasta 06:00 del día siguiente.
// No se valida que hora_inicio/hora_fin caigan dentro de esta ventana (ver blockOverlapsDay).

export function combineDateTime(fecha, hora) {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

export function addDaysStr(fecha, n) {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + n)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function dayWindow(fecha) {
  return {
    start: combineDateTime(fecha, '06:00'),
    end: combineDateTime(addDaysStr(fecha, 1), '06:00'),
  }
}

export function blockBounds(block) {
  return {
    start: combineDateTime(block.fecha_inicio, block.hora_inicio),
    end: combineDateTime(block.fecha_fin, block.hora_fin),
  }
}

export function blockOverlapsDay(block, fecha) {
  const { start: bStart, end: bEnd } = blockBounds(block)
  const { start: dStart, end: dEnd } = dayWindow(fecha)
  return bStart < dEnd && dStart < bEnd
}

// Segmento del bloque dentro de la ventana 06:00-06:00 de `fecha`, en minutos [0,1440]. null si no hay overlap.
export function clipBlockToDay(block, fecha) {
  const { start: bStart, end: bEnd } = blockBounds(block)
  const { start: dStart, end: dEnd } = dayWindow(fecha)
  const clippedStart = bStart > dStart ? bStart : dStart
  const clippedEnd = bEnd < dEnd ? bEnd : dEnd
  if (clippedStart >= clippedEnd) return null
  return {
    startMin: (clippedStart - dStart) / 60000,
    endMin: (clippedEnd - dStart) / 60000,
  }
}

export function pjIdsAvailableOnDay(bloques, fecha) {
  const ids = new Set()
  for (const b of bloques) {
    if (blockOverlapsDay(b, fecha)) ids.add(b.pj_id)
  }
  return [...ids]
}

// month es 0-indexado (convención Date de JS).
export function buildMonthAvailabilityMap(bloques, year, month) {
  const map = {}
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const fecha = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    map[fecha] = pjIdsAvailableOnDay(bloques, fecha)
  }
  return map
}

// Bloques tipo 'no_disponible' son marcadores de día completo (solo `fecha`, sin rango horario).
export function pjIdsUnavailableOnDay(bloques, fecha) {
  const ids = new Set()
  for (const b of bloques) {
    if (b.tipo === 'no_disponible' && b.fecha === fecha) ids.add(b.pj_id)
  }
  return [...ids]
}

// month es 0-indexado (convención Date de JS).
export function buildMonthUnavailabilityMap(bloques, year, month) {
  const map = {}
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const fecha = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    map[fecha] = pjIdsUnavailableOnDay(bloques, fecha)
  }
  return map
}
