import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { userEvent } from './testing/userEvent'

const google = () => screen.queryByRole('button', { name: 'Continuar con Google' })
const send = () => screen.getByRole('button', { name: 'Enviar link mágico' })
const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('LoginPage without a dev email form (production)', () => {
  it('is Google only: no email field, divider, magic link button or spam note', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled />)
    expect(google()).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar link mágico' })).not.toBeInTheDocument()
    expect(screen.queryByText(/o con tu email/)).not.toBeInTheDocument()
    expect(screen.queryByText(/spam/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ingreso de desarrollo/)).not.toBeInTheDocument()
  })

  it('shows an unavailable message instead of a button when Google is disabled', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled={false} />)
    expect(google()).not.toBeInTheDocument()
    expect(screen.getByText('El ingreso con Google no está disponible en este entorno.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })
})

describe('LoginPage with onDevEmailSubmit (development)', () => {
  it('renders the labeled dev section after Google, with the secondary button and no divider or spam note', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled onDevEmailSubmit={vi.fn()} />)
    const heading = screen.getByText('Ingreso de desarrollo (solo local)')
    expect(before(google()!, heading)).toBe(true)
    expect(before(heading, screen.getByLabelText('Email'))).toBe(true)
    expect(before(screen.getByLabelText('Email'), send())).toBe(true)
    expect(google()!.className).toMatch(/bg-accent/)
    expect(send().className).not.toMatch(/bg-accent/)
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.queryByText(/spam/)).not.toBeInTheDocument()
  })

  it('submits the typed email', async () => {
    const onDevEmailSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginPage onGoogle={vi.fn()} googleEnabled onDevEmailSubmit={onDevEmailSubmit} />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(send())
    expect(onDevEmailSubmit).toHaveBeenCalledWith('a@b.co')
  })

  it('with Google disabled shows the dev form and no unavailable message or Google button', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled={false} onDevEmailSubmit={vi.fn()} />)
    expect(google()).not.toBeInTheDocument()
    expect(screen.queryByText(/no está disponible/)).not.toBeInTheDocument()
    expect(send()).toBeInTheDocument()
  })
})
