import { createRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormActionsContext, FormPortContext } from '../../../ports'
import { buildPjFormState } from '../pjFormState'
import PJIdentityTab from './PJIdentityTab'

const fields = [{ key: 'lema', label: 'Lema' }]
const port = { isDM: true, regions: [{ key: 'norte', label: 'Norte' }], characters: [], sesiones: [], characterFields: fields }

describe('PJIdentityTab custom-field wiki-link setter', () => {
  it('applies the picker insertion to the LATEST state: text typed after the field got focus survives', () => {
    const activeFieldRef = createRef()
    const actions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), saving: false, activeFieldRef }
    function Host() {
      const [f, setF] = useState(() => buildPjFormState(null, { regions: port.regions, characterFields: fields }))
      return <PJIdentityTab f={f} setF={setF} isDM isOwnPlayer={false} />
    }
    render(
      <FormActionsContext.Provider value={actions}>
        <FormPortContext.Provider value={port}>
          <Host />
        </FormPortContext.Provider>
      </FormActionsContext.Provider>,
    )
    const lema = screen.getByLabelText('Lema')
    fireEvent.focus(lema) // the picker remembers this field (and its setter)
    fireEvent.change(lema, { target: { value: 'abc' } }) // typed after focus
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'x' } }) // some other field changes too
    const { setter, key } = activeFieldRef.current
    expect(key).toBe('lema')
    act(() => setter((prev) => ({ ...prev, [key]: `${prev[key]} [[{3N}Link]]` }))) // what the picker does
    expect(screen.getByLabelText('Lema')).toHaveValue('abc [[{3N}Link]]')
  })
})

describe('PJIdentityTab motivation label', () => {
  const renderTab = (portOver = {}) => {
    const actions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), saving: false, activeFieldRef: createRef() }
    function Host() {
      const [f, setF] = useState(() => buildPjFormState(null, { regions: port.regions, characterFields: fields }))
      return <PJIdentityTab f={f} setF={setF} isDM isOwnPlayer={false} />
    }
    render(
      <FormActionsContext.Provider value={actions}>
        <FormPortContext.Provider value={{ ...port, ...portOver }}>
          <Host />
        </FormPortContext.Provider>
      </FormActionsContext.Provider>,
    )
  }

  it('is neutral by default and takes the label the adapter provides (the legacy app keeps its guild wording)', () => {
    renderTab()
    expect(screen.getByText('Motivación')).toBeInTheDocument()
  })

  it('uses the port label when given', () => {
    renderTab({ motivoLabel: 'Motivación para unirse al Gremio' })
    expect(screen.getByText('Motivación para unirse al Gremio')).toBeInTheDocument()
  })
})
