import { describe, expect, it } from 'vitest'
import { formatTitle, hubTitleForPath } from './documentTitle'

describe('formatTitle', () => {
  it('joins the parts and ends with the app name, skipping falsy parts', () => {
    expect(formatTitle('Notas', 'Mi campaña')).toBe('Notas · Mi campaña · RPG Quester')
    expect(formatTitle(undefined, 'Mi campaña')).toBe('Mi campaña · RPG Quester')
    expect(formatTitle(false)).toBe('RPG Quester')
  })
})

describe('hubTitleForPath', () => {
  it.each([
    ['/', 'Mis campañas · RPG Quester'],
    ['/login', 'Iniciar sesión · RPG Quester'],
    ['/profile', 'Perfil · RPG Quester'],
    ['/invite/ABCD1234', 'Invitación · RPG Quester'],
    ['/nope', 'Página no encontrada · RPG Quester'],
  ])('%s -> %s', (path, title) => {
    expect(hubTitleForPath(path)).toBe(title)
  })

  it('leaves campaign and legacy routes to their own owners', () => {
    expect(hubTitleForPath('/c/mi-campania/notas')).toBeNull()
    expect(hubTitleForPath('/legacy/x')).toBeNull()
  })
})
