// Synthetic legacy export used by the tests. Everything here is invented; no real data.
export const SECRET_PASSWORD_1 = 'zz-fake-pass-ONE'
export const SECRET_PASSWORD_2 = 'zz-fake-pass-TWO'
export const SENTINEL_TEXT = 'SENTINEL-ROW-TEXT'
export const DM_SECRET_TEXT = 'SENTINEL-DM-SECRET'

export function makeLegacy() {
  return {
    sesiones: [
      { id: 1, tipo: 'sesion', numero: 1, orden: 1, titulo: 'Primera', fecha: '2026-01-10', estado: 'publicado', notas: `${DM_SECRET_TEXT} plan [[{2G}Lugar]]`, resumen: `Resumen ${SENTINEL_TEXT} [[{1P}Aria]] [[{99N}Perdido]]`, createdAt: '2026-01-11T10:00:00.000Z', updatedAt: '2026-01-12T10:00:00.000Z' },
      { id: 2, tipo: 'avance', numero: '', orden: 2, titulo: 'Avance', fecha: '' },
    ],
    pjs: [
      { id: 1, nombre: 'Aria', jugador: 'Ana', clase: 'Mago', raza: 'Elfo', region: 'magral', nivel: 5, magralita: 'Fuerte', player_password: SECRET_PASSWORD_1, player_must_change: true, stat_hp: 20, hechizos: [{ id: 1, nombre: 'Bola', nivel: 3 }], monedas: { cp: 1, sp: 2, ep: 0, gp: 3, pp: 0 }, secreto: 'Es una espía', estado: 'publicado' },
      { id: 2, nombre: 'Borin', jugador: 'Beto', clase: 'Guerrero', raza: 'Enano', region: 'frontera', nivel: 25, magralita: '', player_password: SECRET_PASSWORD_2, player_must_change: false, estado: 'secreto', visibilidad: [1] },
    ],
    pnjs: [{ id: 1, nombre: 'Tabernero', region: 'nezor', relacion: 'aliado', ganchos: 'Conoce un secreto [[{2G}Lugar]]', estado: 'borrador' }],
    lugares: [
      { id: 1, nombre: 'Aldea', region: 'magral', tipo: 'pueblo', notas: '', secreto: '', ganchos: '' },
      { id: 2, nombre: 'Puerto', region: 'islas', tipo: 'ciudad', estado: 'secreto', visibilidad: [1, 2, 77], descripcion: 'Ver [[{1F}Gremio]] y [[{3Z}Raro]] y [[{4}Sin letra]]' },
    ],
    facciones: [{ id: 1, nombre: 'Gremio', region: 'heladas', relacion: 'neutral', secreto: 'Oculto' }],
    lore: [{ id: 1, titulo: 'Historia', categoria: 'mundo', texto: 'Un mito [[{1L}Historia]]' }],
    items: [{ id: 1, nombre: 'Espada', tipo: 'arma', rareza: 'raro', estado: 'weird' }],
    mapas: [
      { id: 1, nombre: 'Mundo', imagen_url: 'https://example.test/m.png', is_default: true, notas: 'nota mapa' },
      { id: 2, nombre: 'Ciudad', imagen_url: '', is_default: true },
    ],
    map_points: [
      { id: 1, map_id: 1, nombre: 'Aldea', x: 0.25, y: 0.75, link_type: 'lugar', link_id: 1 },
      { id: 2, map_id: 1, nombre: 'Libre', x: 0.5, y: 0.5, link_type: '', link_id: '' },
      { id: 3, map_id: 1, nombre: 'Fuera', x: 1.4, y: -0.2, link_type: 'pnj', link_id: 1 },
      { id: 4, map_id: 99, nombre: 'Huerfano', x: 0.1, y: 0.1, link_type: '', link_id: '' },
      { id: 5, map_id: 2, nombre: 'Roto', x: 0.1, y: 0.1, link_type: 'lugar', link_id: 55 },
      { id: 6, map_id: 2, nombre: 'Mitad', x: 0.1, y: 0.1, link_type: 'lugar', link_id: '' },
    ],
    homebrew_rules: [{ id: 1, nombre: 'Regla', texto: 'Texto de regla [[{1H}Regla]]' }],
    player_notes: [
      { id: '1_lugares_1', pj_id: 1, type: 'lugares', entity_id: 1, text: 'Nota de Aria' },
      { id: '1_pnjs_1', pj_id: 1, type: 'pnjs', entity_id: 1, text: '   ' },
      { id: '2_lore_9', pj_id: 2, type: 'lore', entity_id: 9, text: 'Huerfana' },
      { id: '9_lore_1', pj_id: 9, type: 'lore', entity_id: 1, text: 'PJ desconocido' },
    ],
    disponibilidad: [
      { id: 1, tipo: 'sesion', pj_id: null, fecha_inicio: '2026-02-01', fecha_fin: '2026-02-02', hora_inicio: '18:00', hora_fin: '23:00' },
      { id: 2, tipo: 'personal', pj_id: 1, fecha_inicio: '2026-02-03', fecha_fin: '2026-02-04', hora_inicio: '10:00', hora_fin: '12:00' },
      { id: 3, tipo: 'no_disponible', pj_id: 2, fecha: '2026-02-05' },
    ],
    game_logs: [
      { id: 'a', actorType: 'player', playerId: 1, game: 'loteria', date: '2026-03-01', timestamp: '2026-03-01T15:00:00.000Z', roll: 12, prize: { cp: 5 }, prizeTarget: 'player' },
      { id: 'b', actorType: 'player', playerId: 1, game: 'loteria', date: '2026-03-01', timestamp: '2026-03-01T18:00:00.000Z', roll: 20, prize: { gp: 5 }, prizeTarget: 'player' },
      { id: 'c', actorType: 'player', playerId: 42, game: 'loteria', date: '2026-03-02', timestamp: '2026-03-02T09:00:00.000Z', roll: 3, prize: {}, prizeTarget: 'player' },
      { id: 'd', actorType: 'dm', playerId: null, game: 'loteria', date: '2026-03-02', timestamp: '2026-03-02T10:00:00.000Z', roll: 18, prize: { pp: 1 }, prizeTarget: 'pot' },
    ],
    game_pot: [{ id: 'current', cp: 0, sp: 0, ep: 0, gp: 7, pp: 1 }],
    game_config: [
      { id: 'loteria', commonMinRoll: 10, commonPrize: { cp: 5 }, specialPrize: { gp: 5 } },
      { id: 'session_screen', cards: [{ id: 'c1', tipo: 'stats' }] },
    ],
    read_state: [
      { id: 'dm_sesiones_1', viewerId: 'dm', type: 'sesiones', entityId: 1, seenAt: '2026-04-01T00:00:00.000Z' },
      { id: '1_lugares_1', viewerId: '1', type: 'lugares', entityId: 1, section: 'descripcion', seenAt: '2026-04-02T00:00:00.000Z' },
    ],
    login_logs: [{ id: 'l1', pj: 'Aria', ts: '2026-04-03T00:00:00.000Z' }],
  }
}
