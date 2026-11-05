/** G4b: the hub update payload of a character never carries `jugador` (the database derives it from the assignment). */
import { configure, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildPjFormState } from '../pages/pj/pjFormState'
import { useFormActions } from '../ports'
import { createFakeLayer } from './testing/fakeLayer'
import { entity, renderSection } from './testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// A form that changes `jugador` on save, like a form left open across a reassignment (or a buggy one) would.
vi.mock('../components/forms/entityForms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/forms/entityForms')>()
  function HostileForm({ item }: { item: Record<string, unknown> }) {
    const { save } = useFormActions()
    return (
      <button type="button" onClick={() => save('pjs', { ...buildPjFormState(item), id: item.id, jugador: 'Otra persona', nombre: 'Ana B' })}>
        Guardar hostil
      </button>
    )
  }
  return { ...actual, ENTITY_FORMS: { ...actual.ENTITY_FORMS, pjs: HostileForm } }
})

const ANA = entity(1, { nombre: 'Ana', jugador: 'Pepe', clase: '', raza: '', region: 'magral', nivel: 1, imagen_url: '', sections_updated: {}, monedas: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, monedas_guardado: {} })

describe('hub update of a character', () => {
  it('leaves jugador out of the patch, whoever saves, and still writes the rest', async () => {
    for (const isDM of [true, false]) {
      const { layer, spies } = createFakeLayer({ entities: { pjs: [ANA] }, dmNotes: {}, visibility: { 1: [] } })
      const view = renderSection('/c/demo/pjs/1', { layer, isDM, characterIds: isDM ? [] : [1], regions: [{ key: 'magral', label: 'Magral' }] })
      await screen.findByRole('heading', { level: 1, name: 'Ana' })
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Guardar hostil' }))
      await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
      const [, , patch] = spies.saveEntityWithDmNotes.mock.calls[0] as [string, unknown, Record<string, unknown>]
      expect(patch).not.toHaveProperty('jugador')
      expect(patch).toMatchObject({ nombre: 'Ana B' })
      expect(Object.keys(patch).sort()).toEqual(['nombre', 'sections_updated'])
      view.unmount()
    }
  })
})
