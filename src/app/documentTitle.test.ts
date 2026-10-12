import { describe, expect, it } from 'vitest'
import { formatTitle, hubTitleForPath } from './documentTitle'

describe('formatTitle', () => {
  it('joins the parts and ends with the app name, skipping falsy parts', () => {
    expect(formatTitle('Notas', 'Mi campaña')).toBe('Notas · Mi campaña · StoryCore')
    expect(formatTitle(undefined, 'Mi campaña')).toBe('Mi campaña · StoryCore')
    expect(formatTitle(false)).toBe('StoryCore')
  })
})

describe('hubTitleForPath', () => {
  it.each([
    ['/', 'Mis campañas · StoryCore'],
    ['/login', 'Iniciar sesión · StoryCore'],
    ['/profile', 'Perfil · StoryCore'],
    ['/invite/ABCD1234', 'Invitación · StoryCore'],
    ['/nope', 'Página no encontrada · StoryCore'],
  ])('%s -> %s', (path, title) => {
    expect(hubTitleForPath(path)).toBe(title)
  })

  it('leaves campaign and legacy routes to their own owners', () => {
    expect(hubTitleForPath('/c/mi-campania/notas')).toBeNull()
    expect(hubTitleForPath('/legacy/x')).toBeNull()
  })
})
