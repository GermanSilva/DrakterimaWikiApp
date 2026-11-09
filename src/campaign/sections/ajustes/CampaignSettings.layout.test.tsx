import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'

const STORED = { name: 'Drakterima', branding: { logo_url: 'https://x.test/old.png', accent_color: '#dc2626' } }

describe('Ajustes: campaign box layout (S41)', () => {
  it('lays the inputs out in two columns on wide screens, one on narrow, keeping every field and help text', async () => {
    const made = createFakeLayer({ campaign: STORED as never })
    renderSection('/c/demo/ajustes', { layer: made.layer, isDM: true, campaign: STORED as never })
    const form = await screen.findByRole('form', { name: 'Datos de la campaña' })
    expect(form).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-2')

    for (const label of ['Identificador (slug)', 'Nombre', 'Pre-título (opcional)', 'Logo (URL https, opcional)', 'Banner (URL https, opcional)', 'Color de acento (opcional)']) {
      expect(within(form).getByLabelText(label)).toBeInTheDocument()
    }
    for (const [id, hint] of [
      ['campaign-slug', 'Es parte de la dirección de la campaña y no se puede cambiar.'],
      ['campaign-tagline', 'Se muestra sobre el nombre en la barra superior.'],
      ['campaign-logo', 'Dejalo vacío para usar el ícono de RPG Quester.'],
      ['campaign-banner', 'Imagen de fondo del encabezado del panel.'],
      ['campaign-accent', 'Formato #rrggbb. Dejalo vacío para usar el color por defecto.'],
    ]) {
      const help = document.getElementById(`${id}-hint`) as HTMLElement
      expect(help.textContent).toContain(hint)
      // the help text stays under its own input, in the same cell
      expect(help.parentElement).toContainElement(document.getElementById(id))
    }
  })

  it('lets the colour row, the preview and the save button span both columns', async () => {
    const made = createFakeLayer({ campaign: STORED as never })
    renderSection('/c/demo/ajustes', { layer: made.layer, isDM: true, campaign: STORED as never })
    const form = await screen.findByRole('form', { name: 'Datos de la campaña' })
    expect(document.getElementById('campaign-accent-hint')?.parentElement).toHaveClass('md:col-span-2')
    expect(within(form).getByRole('group', { name: 'Vista previa' })).toHaveClass('md:col-span-2')
    expect(within(form).getByRole('button', { name: 'Guardar campaña' }).parentElement).toHaveClass('md:col-span-2')
  })
})
