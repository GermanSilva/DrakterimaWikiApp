import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlatEntity } from '../../../data'
import { FormActionsContext, FormPortContext, type FormActions, type FormPort } from '../../../ports'
import { ENTITY, SHEET } from './editorFixture'
import SheetEditor from './SheetEditor'

const port: FormPort = { isDM: true, regions: [], characters: [], sesiones: [], sheet: SHEET }
const actions: FormActions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), activeFieldRef: { current: null } }
afterEach(() => vi.restoreAllMocks())

describe('SheetEditor: tabs in a scroll strip (S41)', () => {
  it('draws the tabs in a ScrollStrip, marks the active one and scrolls a newly picked tab into view', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(
      <FormPortContext.Provider value={port}>
        <FormActionsContext.Provider value={actions}>
          <SheetEditor item={ENTITY as unknown as FlatEntity} />
        </FormActionsContext.Provider>
      </FormPortContext.Provider>,
    )
    const strip = screen.getByTestId('scroll-strip')
    expect(within(strip).getByRole('button', { name: 'Identidad' })).toHaveAttribute('data-active', 'true')
    expect(within(strip).getByRole('button', { name: 'Mecánicas' })).not.toHaveAttribute('data-active')
    fireEvent.click(within(strip).getByRole('button', { name: 'Mecánicas' }))
    expect(within(strip).getByRole('button', { name: 'Mecánicas' })).toHaveAttribute('data-active', 'true')
    expect(scrollIntoView.mock.instances.at(-1)).toBe(within(strip).getByRole('button', { name: 'Mecánicas' }))
  })
})
