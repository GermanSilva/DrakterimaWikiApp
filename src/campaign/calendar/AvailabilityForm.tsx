import { useId, useState } from 'react'
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '../../constants'
import type { BusySlot, PlayerAvailability } from '../../data'
import { usePlayerAvailabilityActions } from '../entities/usePlayerAvailabilityActions'
import { asBlock, conflictingUserIds, shortTime } from './availabilityCalc'
import { BusyAvailabilityNotice, type BusyStatus } from './BusyAvailabilityNotice'
import { ModalShell } from './ModalShell'

type Scope = 'general' | 'campaign'
type Tipo = PlayerAvailability['tipo']

interface Props {
  campaignId: string
  userId: string
  /** The day the user clicked (default of every date field). */
  fecha: string
  /** The row being edited; absent when creating. */
  row?: PlayerAvailability
  /** Slots of other campaigns' sessions (any member): only the caller's are checked. */
  busy: readonly BusySlot[]
  /** Saving is held back until the busy slots are known. */
  busyStatus: BusyStatus
  onRetryBusy: () => void
  onClose: () => void
}

export const BUSY_MESSAGE = 'Ese horario se superpone con otro compromiso tuyo, así que no podés marcarlo como disponible.'

/**
 * Form for the signed-in user's OWN availability (players and DM alike). The scope decides whether the
 * entry applies to every campaign the user plays in (general, `campaign_id` null) or only to this one.
 */
export function AvailabilityForm({ campaignId, userId, fecha, row, busy, busyStatus, onRetryBusy, onClose }: Props) {
  const actions = usePlayerAvailabilityActions()
  const scopeName = useId()
  const [tipo, setTipo] = useState<Tipo>(row?.tipo ?? 'personal')
  const [scope, setScope] = useState<Scope>(row && row.campaign_id !== null ? 'campaign' : 'general')
  const [f, setF] = useState({
    fecha: row?.fecha ?? fecha,
    fecha_inicio: row?.fecha_inicio ?? fecha,
    fecha_fin: row?.fecha_fin ?? fecha,
    hora_inicio: row?.hora_inicio ? shortTime(row.hora_inicio) : '',
    hora_fin: row?.hora_fin ? shortTime(row.hora_fin) : '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setStart = (v: string) => setF((p) => ({ ...p, fecha_inicio: v, fecha_fin: v }))
  const setEnd = (v: string) => setF((p) => (v < p.fecha_inicio ? { ...p, fecha_inicio: v, fecha_fin: v } : { ...p, fecha_fin: v }))

  const block = tipo === 'personal' ? asBlock(f) : null
  const busyConflict = block !== null && conflictingUserIds(block, busy, [userId]).length > 0

  const validate = (): string | null => {
    if (tipo === 'no_disponible') return f.fecha ? null : 'Elegí el día.'
    if (!f.fecha_inicio || !f.fecha_fin || !f.hora_inicio || !f.hora_fin) return 'Completá los 4 campos.'
    if (f.fecha_fin === f.fecha_inicio && f.hora_fin <= f.hora_inicio) return 'La hora de fin debe ser posterior a la hora de inicio.'
    return null
  }

  const save = async () => {
    if (busyStatus !== 'ready') return
    const problem = validate()
    setError(problem)
    if (problem || busyConflict) return
    const input =
      tipo === 'personal'
        ? { tipo, fecha: null, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin }
        : { tipo, fecha: f.fecha, fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null }
    const payload = { ...input, campaign_id: scope === 'campaign' ? campaignId : null }
    setSaving(true)
    const saved = row ? await actions.update(row.id, payload) : await actions.create(payload)
    setSaving(false)
    if (saved) onClose()
  }

  const remove = async () => {
    if (!row) return
    setSaving(true)
    const ok = await actions.remove(row.id)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ModalShell title={row ? 'Editar mi disponibilidad' : 'Agregar mi disponibilidad'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <fieldset className="border-0 p-0 m-0">
          <legend className={labelCls}>Tipo</legend>
          <div className="flex flex-wrap gap-4 text-sm text-txt-secondary">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`${scopeName}-tipo`} checked={tipo === 'personal'} onChange={() => setTipo('personal')} />
              Disponible en un horario
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`${scopeName}-tipo`} checked={tipo === 'no_disponible'} onChange={() => setTipo('no_disponible')} />
              No disponible todo el día
            </label>
          </div>
        </fieldset>

        {tipo === 'personal' ? (
          <>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div>
                <label className={labelCls} htmlFor={`${scopeName}-fi`}>Fecha de inicio</label>
                <input id={`${scopeName}-fi`} className={inputCls} type="date" value={f.fecha_inicio} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor={`${scopeName}-ff`}>Fecha de fin</label>
                <input id={`${scopeName}-ff`} className={inputCls} type="date" value={f.fecha_fin} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div>
                <label className={labelCls} htmlFor={`${scopeName}-hi`}>Hora de inicio</label>
                <input id={`${scopeName}-hi`} className={inputCls} type="time" value={f.hora_inicio} onChange={(e) => setF((p) => ({ ...p, hora_inicio: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor={`${scopeName}-hf`}>Hora de fin</label>
                <input id={`${scopeName}-hf`} className={inputCls} type="time" value={f.hora_fin} onChange={(e) => setF((p) => ({ ...p, hora_fin: e.target.value }))} />
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className={labelCls} htmlFor={`${scopeName}-dia`}>Día</label>
            <input id={`${scopeName}-dia`} className={inputCls} type="date" value={f.fecha} onChange={(e) => setF((p) => ({ ...p, fecha: e.target.value }))} />
          </div>
        )}

        <fieldset className="border-0 p-0 m-0">
          <legend className={labelCls}>Alcance</legend>
          <div className="flex flex-col gap-2 text-sm text-txt-secondary">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`${scopeName}-scope`} checked={scope === 'general'} onChange={() => setScope('general')} />
              General (todas mis campañas)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`${scopeName}-scope`} checked={scope === 'campaign'} onChange={() => setScope('campaign')} />
              Solo esta campaña
            </label>
          </div>
        </fieldset>

        {busyConflict && (
          <p role="alert" className="text-sm text-red-400 m-0">
            {BUSY_MESSAGE}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400 m-0">
            {error}
          </p>
        )}
        <BusyAvailabilityNotice status={busyStatus} onRetry={onRetryBusy} />

        <div className="flex gap-2.5 justify-end flex-wrap">
          {row && (
            <button type="button" className={btnDanger} onClick={remove} disabled={saving}>
              Eliminar
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={btnPrimary} onClick={save} disabled={saving || busyConflict || busyStatus !== 'ready'}>
            Guardar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
