import { useId, useMemo, useState } from 'react'
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '../../constants'
import type { BusySlot, Disponibilidad } from '../../data'
import { useDisponibilidadActions } from '../entities/useDisponibilidadActions'
import { asBlock, conflictingUserIds, shortTime, type MemberMarker } from './availabilityCalc'
import { BusyAvailabilityNotice, type BusyStatus } from './BusyAvailabilityNotice'
import { ModalShell } from './ModalShell'

interface Props {
  fecha: string
  /** The slot being edited; absent when creating. */
  slot?: Disponibilidad
  busy: readonly BusySlot[]
  members: readonly MemberMarker[]
  /** Saving is held back until the busy slots are known. */
  busyStatus: BusyStatus
  onRetryBusy: () => void
  onClose: () => void
}

/** DM-only form of a session slot. A member booked by another campaign blocks the slot (UI level). */
export function SessionSlotForm({ fecha, slot, busy, members, busyStatus, onRetryBusy, onClose }: Props) {
  const actions = useDisponibilidadActions()
  const id = useId()
  const [f, setF] = useState({
    fecha_inicio: slot?.fecha_inicio ?? fecha,
    fecha_fin: slot?.fecha_fin ?? fecha,
    hora_inicio: slot?.hora_inicio ? shortTime(slot.hora_inicio) : '',
    hora_fin: slot?.hora_fin ? shortTime(slot.hora_fin) : '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setStart = (v: string) => setF((p) => ({ ...p, fecha_inicio: v, fecha_fin: v }))
  const setEnd = (v: string) => setF((p) => (v < p.fecha_inicio ? { ...p, fecha_inicio: v, fecha_fin: v } : { ...p, fecha_fin: v }))

  const conflicts = useMemo(() => {
    const block = asBlock(f)
    if (!block) return []
    const ids = conflictingUserIds(block, busy, members.map((m) => m.userId))
    return members.filter((m) => ids.includes(m.userId))
  }, [f, busy, members])

  const save = async () => {
    if (busyStatus !== 'ready') return
    let problem: string | null = null
    if (!f.fecha_inicio || !f.fecha_fin || !f.hora_inicio || !f.hora_fin) problem = 'Completá los 4 campos.'
    else if (f.fecha_fin === f.fecha_inicio && f.hora_fin <= f.hora_inicio) problem = 'La hora de fin debe ser posterior a la hora de inicio.'
    setError(problem)
    if (problem || conflicts.length > 0) return
    const payload = { tipo: 'sesion' as const, ...f }
    setSaving(true)
    const saved = slot ? await actions.update(slot.id, payload) : await actions.create(payload)
    setSaving(false)
    if (saved) onClose()
  }

  const remove = async () => {
    if (!slot) return
    setSaving(true)
    const ok = await actions.remove(slot.id)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ModalShell title={slot ? 'Editar sesión' : 'Agregar sesión'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <div>
            <label className={labelCls} htmlFor={`${id}-fi`}>Fecha de inicio</label>
            <input id={`${id}-fi`} className={inputCls} type="date" value={f.fecha_inicio} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`${id}-ff`}>Fecha de fin</label>
            <input id={`${id}-ff`} className={inputCls} type="date" value={f.fecha_fin} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <div>
            <label className={labelCls} htmlFor={`${id}-hi`}>Hora de inicio</label>
            <input id={`${id}-hi`} className={inputCls} type="time" value={f.hora_inicio} onChange={(e) => setF((p) => ({ ...p, hora_inicio: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`${id}-hf`}>Hora de fin</label>
            <input id={`${id}-hf`} className={inputCls} type="time" value={f.hora_fin} onChange={(e) => setF((p) => ({ ...p, hora_fin: e.target.value }))} />
          </div>
        </div>

        {conflicts.length > 0 && (
          <p role="alert" className="text-sm text-red-400 m-0">
            No se puede fijar la sesión en ese horario: {conflicts.map((m) => m.name).join(', ')} ya {conflicts.length > 1 ? 'tienen' : 'tiene'} otro compromiso.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400 m-0">
            {error}
          </p>
        )}
        <BusyAvailabilityNotice status={busyStatus} onRetry={onRetryBusy} />

        <div className="flex gap-2.5 justify-end flex-wrap">
          {slot && (
            <button type="button" className={btnDanger} onClick={remove} disabled={saving}>
              Eliminar
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={btnPrimary} onClick={save} disabled={saving || conflicts.length > 0 || busyStatus !== 'ready'}>
            Guardar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
