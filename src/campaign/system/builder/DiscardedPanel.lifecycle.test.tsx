/** G9 (S26, S32): the "Campos descartados" list shows when each entry is deleted and warns in the last 7 days; restore and delete stay available. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiscardedPanel } from './DiscardedPanel'

const field = (key: string, label: string) => ({ kind: 'field', key, label, type: 'short', editableBy: 'dm' })
// 2026-09-01 + 60 days = 31/10/2026; 2026-10-01 + 60 days = 30/11/2026
const NEAR = { item: field('cerca', 'Cerca') as never, section: 'perfil', at: '2026-09-01T10:00:00.000Z' }
const FAR = { item: field('lejos', 'Lejos') as never, section: 'perfil', at: '2026-10-01T10:00:00.000Z' }

function renderPanel(now: Date, entries = [NEAR, FAR]) {
  const onRestore = vi.fn()
  const onDelete = vi.fn()
  render(
    <DiscardedPanel
      entries={entries}
      sectionLabels={new Map([['perfil', 'Perfil']])}
      characters={[]}
      canDelete
      savedKeys={new Set(['cerca', 'lejos'])}
      dirty={false}
      error={null}
      now={now}
      onRestore={onRestore}
      onDelete={onDelete}
    />,
  )
  return { onRestore, onDelete }
}
const card = (name: string) => screen.getByRole('group', { name: `Descartado ${name}` })

describe('DiscardedPanel deletion dates', () => {
  it('shows every entry the date it will be deleted (discard date + 60 days)', () => {
    renderPanel(new Date('2026-10-02T10:00:00.000Z'))
    expect(card('Cerca')).toHaveTextContent('Se elimina el 31/10/2026')
    expect(card('Lejos')).toHaveTextContent('Se elimina el 30/11/2026')
  })

  it('warns only within 7 days of the deletion: 8 days before, none', () => {
    renderPanel(new Date('2026-10-23T10:00:00.000Z'))
    expect(within(card('Cerca')).queryByText(/Se eliminará automáticamente/)).not.toBeInTheDocument()
  })

  it('warns exactly 7 days before', () => {
    renderPanel(new Date('2026-10-24T10:00:00.000Z'))
    expect(within(card('Cerca')).getByText('Se eliminará automáticamente el 31/10/2026')).toBeInTheDocument()
    expect(within(card('Lejos')).queryByText(/Se eliminará automáticamente/)).not.toBeInTheDocument()
  })

  it('still warns once the date has passed and the job has not run', () => {
    renderPanel(new Date('2026-11-01T10:00:00.000Z'))
    expect(within(card('Cerca')).getByText('Se eliminará automáticamente el 31/10/2026')).toBeInTheDocument()
  })

  it('the DM can still restore or delete an entry that is about to expire', () => {
    const { onRestore, onDelete } = renderPanel(new Date('2026-10-30T10:00:00.000Z'))
    fireEvent.click(within(card('Cerca')).getByRole('button', { name: 'Restaurar' }))
    expect(onRestore).toHaveBeenCalledWith('cerca')
    fireEvent.click(within(card('Cerca')).getByRole('button', { name: 'Eliminar definitivamente' }))
    expect(onDelete).toHaveBeenCalledWith('cerca')
  })
})
