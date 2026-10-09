import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Copy, RefreshCw, Trash2 } from 'lucide-react'
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '../../../constants'
import { DataError, type Invite } from '../../../data'
import { ModalShell } from '../../calendar/ModalShell'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { useEntities } from '../../entities/useEntities'
import { useLoad } from '../../entities/useLoad'
import { useToast } from '../../toastContext'
import { Loading } from '../DetailNotice'
import {
  buildInvite,
  createInviteErrorMessage,
  DEFAULT_EXPIRY_DAYS,
  EMPTY_DRAFT,
  expiryOptions,
  inviteStatus,
  inviteUrl,
  isLive,
  MAX_USES_LIMIT,
  STATUS_LABEL,
  type InviteDraft,
  type InviteKind,
} from './inviteForm'

const DATE_TIME = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

const KINDS: { kind: InviteKind; label: string; hint: string }[] = [
  { kind: 'player', label: 'Jugador', hint: 'Un enlace que puede usar la cantidad de personas que indiques.' },
  { kind: 'character', label: 'Jugador con personaje', hint: 'Un solo uso: la persona recibe el personaje elegido al unirse.' },
  { kind: 'dm', label: 'DM', hint: 'Da control total de la campaña.' },
]

function kindLabel(invite: Invite, characterName: string | null): string {
  if (invite.role === 'dm') return 'DM'
  if (invite.character_id !== null) return `Jugador con personaje: ${characterName ?? `#${invite.character_id}`}`
  return 'Jugador'
}

function ConfirmRevoke({ onConfirm, onClose, busy }: { onConfirm: () => void; onClose: () => void; busy: boolean }) {
  return (
    <ModalShell title="Revocar invitación" onClose={onClose}>
      <p className="text-sm text-txt-secondary mb-5">
        El enlace y el código dejan de funcionar de inmediato. Quienes ya se unieron con esta invitación siguen en la campaña.
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={btnDanger} onClick={onConfirm} disabled={busy}>
          Revocar
        </button>
      </div>
    </ModalShell>
  )
}

/** Writes `text` to the clipboard and says so; where the browser refuses, tells the DM to copy it by hand. */
function useCopy() {
  const { showToast } = useToast()
  return async (text: string, done: string, noun: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(done)
    } catch {
      showToast(`No pudimos copiar ${noun}. Seleccionalo y copialo a mano.`, 'error')
    }
  }
}

function InviteActions({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const copy = useCopy()
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btnSecondary} onClick={() => copy(inviteUrl(window.location.origin, invite.code), 'Enlace copiado.', 'el enlace')}>
        <Copy size={13} aria-hidden="true" />
        Copiar enlace
      </button>
      <button type="button" className={btnSecondary} onClick={() => copy(invite.code, 'Código copiado.', 'el código')}>
        <Copy size={13} aria-hidden="true" />
        Copiar código
      </button>
      <button type="button" className={btnDanger} onClick={onRevoke}>
        <Trash2 size={13} aria-hidden="true" />
        Revocar
      </button>
    </div>
  )
}

/** DM only: create, share and revoke the invitations of the campaign. */
export function InvitesSettings() {
  const { layer, campaignId } = useCampaignServices()
  const invites = useLoad(() => layer.campaigns.listInvites(campaignId), `invites:${campaignId}`)
  const pjs = useEntities('pjs')
  const uid = useId()
  const [draft, setDraft] = useState<InviteDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<Invite | null>(null)
  const [revoking, setRevoking] = useState<Invite | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [revokeBusy, setRevokeBusy] = useState(false)
  // A click must not create two invitations: the ref flips synchronously, state would lag a second click.
  const createStarted = useRef(false)
  const revokeStarted = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const copy = useCopy()

  const now = new Date()
  const characterNames = useMemo(() => new Map(pjs.items.map((p) => [p.id, String(p.nombre ?? '')])), [pjs.items])
  const nameOf = (invite: Invite) => (invite.character_id === null ? null : characterNames.get(invite.character_id) || null)

  // Characters nobody owns and that have no live claim invite already (the database refuses both anyway).
  const offered = useMemo(() => {
    const held = new Set((invites.data ?? []).filter((i) => i.character_id !== null && isLive(i, new Date())).map((i) => i.character_id))
    return pjs.items.filter((p) => !p.owner_id && !held.has(p.id))
  }, [pjs.items, invites.data])

  function setKind(kind: InviteKind) {
    setFormError(null)
    setDraft((d) => ({ ...d, kind, days: expiryOptions(kind).includes(d.days) ? d.days : DEFAULT_EXPIRY_DAYS }))
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (createStarted.current) return
    const built = buildInvite(campaignId, draft, new Date())
    if (!built.ok) {
      setFormError(built.error)
      return
    }
    createStarted.current = true
    setCreating(true)
    setFormError(null)
    setNotice(null)
    try {
      const invite = await layer.campaigns.createInvite(built.invite)
      if (!mounted.current) return
      setCreated(invite)
      setDraft((d) => ({ ...d, characterId: '' }))
    } catch (err) {
      if (mounted.current) setFormError(createInviteErrorMessage(err))
    } finally {
      createStarted.current = false
      if (mounted.current) setCreating(false)
      if (mounted.current) invites.refresh()
    }
  }

  async function revoke() {
    if (!revoking || revokeStarted.current) return
    const target = revoking
    revokeStarted.current = true
    setRevokeBusy(true)
    try {
      await layer.campaigns.revokeInvite(target.id)
      if (!mounted.current) return
      setNotice({ kind: 'ok', text: 'Invitación revocada.' })
    } catch (err) {
      if (!mounted.current) return
      // already gone (revoked from another tab): the goal is met
      if (err instanceof DataError && err.kind === 'not_found') setNotice({ kind: 'ok', text: 'Esa invitación ya no existía.' })
      else setNotice({ kind: 'error', text: describeDataError(err, 'No pudimos revocar la invitación. Volvé a intentar.') })
    } finally {
      revokeStarted.current = false
      if (mounted.current) {
        setRevokeBusy(false)
        setRevoking(null)
        if (created?.id === target.id) setCreated(null)
        invites.refresh()
      }
    }
  }

  const sorted = invites.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <form noValidate onSubmit={create} aria-label="Nueva invitación" className="bg-bg-card border border-border-base px-5 py-4 flex flex-col gap-4">
        <fieldset className="border-0 p-0 m-0">
          <legend className={labelCls}>Tipo de invitación</legend>
          <div className="flex flex-col gap-2">
            {KINDS.map(({ kind, label, hint }) => (
              <div key={kind} className="flex items-start gap-2 text-[13px] text-txt-secondary">
                <input
                  id={`${uid}-kind-${kind}`}
                  type="radio"
                  name={`${uid}-kind`}
                  className="mt-1 cursor-pointer"
                  checked={draft.kind === kind}
                  aria-describedby={`${uid}-kind-${kind}-hint`}
                  onChange={() => setKind(kind)}
                />
                <div>
                  <label htmlFor={`${uid}-kind-${kind}`} className="text-txt-primary font-semibold cursor-pointer">
                    {label}
                  </label>
                  <p id={`${uid}-kind-${kind}-hint`} className="text-[12px] text-txt-muted">
                    {hint}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {draft.kind === 'dm' && (
          <p role="note" className="text-[13px] text-accent-bright border border-accent-dim px-3 py-2">
            Atención: quien use esta invitación va a ser DM, con acceso a todo el contenido secreto y a la administración de la campaña (incluso a
            quitarte el rol). Compartila solo con alguien de máxima confianza. Es de un solo uso y vence en 7 días como máximo.
          </p>
        )}

        {draft.kind === 'character' && (
          <div>
            <label htmlFor={`${uid}-char`} className={labelCls}>
              Personaje
            </label>
            {offered.length === 0 ? (
              <p id={`${uid}-char`} className="text-[12px] text-txt-muted italic">
                No hay personajes sin jugador y sin invitación vigente.
              </p>
            ) : (
              <select id={`${uid}-char`} className={inputCls} value={draft.characterId} onChange={(e) => setDraft({ ...draft, characterId: e.target.value })}>
                <option value="">Elegí un personaje…</option>
                {offered.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {String(p.nombre ?? `Personaje #${p.id}`)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-days`} className={labelCls}>
              Vence en
            </label>
            <select id={`${uid}-days`} className={inputCls} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })}>
              {expiryOptions(draft.kind).map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? '1 día' : `${d} días`}
                </option>
              ))}
            </select>
          </div>
          {draft.kind === 'player' && (
            <div>
              <label htmlFor={`${uid}-uses`} className={labelCls}>
                Usos máximos
              </label>
              <input
                id={`${uid}-uses`}
                className={inputCls}
                inputMode="numeric"
                value={draft.maxUses}
                onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
                aria-describedby={`${uid}-uses-hint`}
              />
              <p id={`${uid}-uses-hint`} className="text-[11px] text-txt-muted mt-1">
                Entre 1 y {MAX_USES_LIMIT} personas pueden unirse con el mismo enlace.
              </p>
            </div>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-[13px] text-red-400">
            {formError}
          </p>
        )}
        <div>
          <button type="submit" className={btnPrimary} disabled={creating}>
            {creating ? 'Creando…' : 'Crear invitación'}
          </button>
        </div>
      </form>

      {created && (
        <section aria-label="Invitación creada" className="bg-bg-card border border-accent-dim px-5 py-4 flex flex-col gap-2">
          <p role="status" className="text-[13px] text-accent-bright font-semibold">
            Invitación creada. Compartí este enlace:
          </p>
          <p className="font-mono text-[12px] text-txt-primary break-all select-all">{inviteUrl(window.location.origin, created.code)}</p>
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={() => copy(inviteUrl(window.location.origin, created.code), 'Enlace copiado.', 'el enlace')}>
              <Copy size={13} aria-hidden="true" />
              Copiar enlace
            </button>
            <button type="button" className={btnSecondary} onClick={() => setCreated(null)}>
              Cerrar
            </button>
          </div>
        </section>
      )}

      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`text-[13px] ${notice.kind === 'error' ? 'text-red-400' : 'text-accent-bright'}`}>
          {notice.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted">Invitaciones</h3>
        <button type="button" className={btnSecondary} onClick={invites.refresh}>
          <RefreshCw size={13} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {(invites.status === 'loading' || invites.status === 'idle') && <Loading />}
      {invites.status === 'error' && (
        <div className="bg-bg-card border border-border-base px-5 py-4">
          <p role="alert" className="text-[13px] text-red-400 mb-3">
            No pudimos cargar las invitaciones.
          </p>
          <button type="button" className={btnSecondary} onClick={invites.refresh}>
            Reintentar
          </button>
        </div>
      )}
      {invites.status === 'ready' && sorted.length === 0 && (
        <p className="text-[13px] text-txt-muted italic px-1">Todavía no hay invitaciones.</p>
      )}
      {invites.status === 'ready' && sorted.length > 0 && (
        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {sorted.map((invite) => {
            const status = inviteStatus(invite, now)
            return (
              <li key={invite.id} className="bg-bg-card border border-border-base px-5 py-3 flex flex-col gap-2" aria-label={`Invitación ${kindLabel(invite, nameOf(invite))}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.04em]">{kindLabel(invite, nameOf(invite))}</span>
                  <span className={`text-[11px] font-semibold ${status === 'active' ? 'text-accent-bright' : 'text-txt-muted'}`}>{STATUS_LABEL[status]}</span>
                  <span className="text-[12px] text-txt-secondary">
                    Usos: {invite.uses}/{invite.max_uses}
                  </span>
                  <span className="text-[12px] text-txt-secondary">
                    {invite.expires_at ? (
                      <>
                        {status === 'expired' ? 'Venció' : 'Vence'}: <time dateTime={invite.expires_at}>{DATE_TIME.format(new Date(invite.expires_at))}</time>
                      </>
                    ) : (
                      'Sin vencimiento'
                    )}
                  </span>
                </div>
                <p className="font-mono text-[12px] text-txt-muted break-all select-all">
                  <span className="sr-only">Código: </span>
                  {invite.code}
                </p>
                <InviteActions invite={invite} onRevoke={() => setRevoking(invite)} />
              </li>
            )
          })}
        </ul>
      )}

      {revoking && <ConfirmRevoke busy={revokeBusy} onConfirm={revoke} onClose={() => !revokeBusy && setRevoking(null)} />}
    </div>
  )
}
