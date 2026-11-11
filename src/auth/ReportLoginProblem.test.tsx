import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoginFailureReportInput, LoginFailureReportResult } from '../data'
import { AuthFlowError } from './authErrors'
import { LoginPage } from './LoginPage'
import { ReportLoginProblem } from './ReportLoginProblem'
import { userEvent } from './testing/userEvent'

type OnReport = (input: LoginFailureReportInput) => Promise<LoginFailureReportResult>
const reportFn = (result: LoginFailureReportResult = 'ok') => vi.fn<OnReport>(async () => result)

const toggle = () => screen.getByRole('button', { name: 'Reportar el problema' })
const queryToggle = () => screen.queryByRole('button', { name: 'Reportar el problema' })
const send = () => screen.getByRole('button', { name: /Enviar reporte|Enviando/ })

async function open() {
  await userEvent.click(toggle())
}

afterEach(() => window.history.pushState({}, '', '/'))

describe('LoginPage report option visibility', () => {
  it('is hidden in the normal state', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled onReportLoginFailure={reportFn()} />)
    expect(queryToggle()).not.toBeInTheDocument()
  })

  it('is shown when Google is disabled', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled={false} onReportLoginFailure={reportFn()} />)
    expect(toggle()).toBeInTheDocument()
  })

  it('is shown after a Google attempt ended in error', async () => {
    render(<LoginPage onGoogle={vi.fn(async () => Promise.reject(new AuthFlowError('network')))} onReportLoginFailure={reportFn()} />)
    expect(queryToggle()).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(toggle()).toBeInTheDocument()
  })

  it('is not rendered without a report handler', () => {
    render(<LoginPage onGoogle={vi.fn()} googleEnabled={false} />)
    expect(queryToggle()).not.toBeInTheDocument()
  })

  it('sends kind google_error with the AuthFlowError kind after a Google failure', async () => {
    const onReport = reportFn()
    render(<LoginPage onGoogle={vi.fn(async () => Promise.reject(new AuthFlowError('provider_disabled')))} onReportLoginFailure={onReport} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    await open()
    await userEvent.click(send())
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'google_error', errorKind: 'provider_disabled' }))
  })
})

describe('ReportLoginProblem', () => {
  it('toggles an inline form with aria-expanded/aria-controls and focuses the textarea', async () => {
    render(<ReportLoginProblem kind="google_disabled" onReport={reportFn()} />)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('¿Qué pasó? (opcional)')).not.toBeInTheDocument()
    await open()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    const area = screen.getByLabelText('¿Qué pasó? (opcional)')
    expect(toggle().getAttribute('aria-controls')).toBe(area.closest('form')!.id)
    expect(area).toHaveFocus()
    expect(area).toHaveAttribute('maxlength', '1000')
    expect(screen.getByText('1000 caracteres restantes')).toBeInTheDocument()
    await userEvent.type(area, 'hola')
    expect(screen.getByText('996 caracteres restantes')).toBeInTheDocument()
  })

  it('Cancelar collapses the form', async () => {
    render(<ReportLoginProblem kind="google_disabled" onReport={reportFn()} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('¿Qué pasó? (opcional)')).not.toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('has a hidden honeypot named website that stays empty', async () => {
    render(<ReportLoginProblem kind="google_disabled" onReport={reportFn()} />)
    await open()
    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]')!
    expect(honeypot).toHaveAttribute('aria-hidden', 'true')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
    expect(honeypot).toHaveAttribute('autocomplete', 'off')
    expect(honeypot.value).toBe('')
  })

  it('sends the honeypot value a bot typed, so the server can drop the report', async () => {
    const onReport = reportFn()
    render(<ReportLoginProblem kind="google_disabled" onReport={onReport} />)
    await open()
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="website"]')!, { target: { value: 'spam.example' } })
    await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ website: 'spam.example' }))
  })

  it('sends kind, errorKind, message, contact, pathname without query and an empty honeypot', async () => {
    window.history.pushState({}, '', '/login?next=/invite/SECRET')
    const onReport = reportFn()
    render(<ReportLoginProblem kind="google_error" errorKind="network" onReport={onReport} />)
    await open()
    await userEvent.type(screen.getByLabelText('¿Qué pasó? (opcional)'), 'no entra')
    await userEvent.type(screen.getByLabelText('Tu email para avisarte (opcional)'), 'ana@test.co')
    await userEvent.click(send())
    expect(onReport).toHaveBeenCalledTimes(1)
    expect(onReport).toHaveBeenCalledWith({
      kind: 'google_error',
      errorKind: 'network',
      message: 'no entra',
      contact: 'ana@test.co',
      path: '/login',
      website: '',
    })
  })

  it('omits empty optional fields', async () => {
    const onReport = reportFn()
    render(<ReportLoginProblem kind="google_disabled" onReport={onReport} />)
    await open()
    await userEvent.click(send())
    const sent = onReport.mock.calls[0][0]
    expect(sent.kind).toBe('google_disabled')
    expect(sent.message).toBeUndefined()
    expect(sent.contact).toBeUndefined()
    expect(sent.errorKind).toBeUndefined()
  })

  it('shows «Enviando…» with the button disabled while sending', async () => {
    let resolve!: (r: LoginFailureReportResult) => void
    const onReport = vi.fn<OnReport>(() => new Promise((r) => (resolve = r)))
    render(<ReportLoginProblem kind="google_disabled" onReport={onReport} />)
    await open()
    await userEvent.click(send())
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    resolve('ok')
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('replaces the form with a thank-you status on success', async () => {
    render(<ReportLoginProblem kind="google_disabled" onReport={reportFn('ok')} />)
    await open()
    await userEvent.click(send())
    expect(await screen.findByRole('status')).toHaveTextContent('Gracias. Ya le avisamos al administrador y lo va a revisar.')
    expect(screen.queryByLabelText('¿Qué pasó? (opcional)')).not.toBeInTheDocument()
  })

  it.each([
    ['rate_limited', 'Ya recibimos varios reportes recientes. Probá de nuevo más tarde.'],
    ['invalid_input', 'Revisá el email: no parece válido.'],
    ['unavailable', 'No pudimos enviar el reporte. Probá de nuevo en unos minutos.'],
  ] as const)('%s shows an alert and keeps the input', async (result, text) => {
    render(<ReportLoginProblem kind="google_disabled" onReport={reportFn(result)} />)
    await open()
    await userEvent.type(screen.getByLabelText('¿Qué pasó? (opcional)'), 'texto')
    await userEvent.type(screen.getByLabelText('Tu email para avisarte (opcional)'), 'ana@test.co')
    await userEvent.click(send())
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText('¿Qué pasó? (opcional)')).toHaveValue('texto')
    expect(screen.getByLabelText('Tu email para avisarte (opcional)')).toHaveValue('ana@test.co')
    expect(send()).not.toBeDisabled()
  })

  it('treats a rejected handler as unavailable', async () => {
    render(<ReportLoginProblem kind="google_disabled" onReport={vi.fn<OnReport>(async () => Promise.reject(new Error('x')))} />)
    await open()
    await userEvent.click(send())
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar el reporte. Probá de nuevo en unos minutos.')
  })

  it('validates the email before sending', async () => {
    const onReport = reportFn()
    render(<ReportLoginProblem kind="google_disabled" onReport={onReport} />)
    await open()
    await userEvent.type(screen.getByLabelText('Tu email para avisarte (opcional)'), 'no-es-email')
    await userEvent.click(send())
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá el email: no parece válido.')
    expect(onReport).not.toHaveBeenCalled()
  })
})
