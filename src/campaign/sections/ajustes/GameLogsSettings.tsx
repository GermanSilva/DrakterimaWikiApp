import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { btnDanger, btnSecondary } from '../../../constants'
import { DataError, type GameLog } from '../../../data'
import { ModalShell } from '../../calendar/ModalShell'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { useEntities } from '../../entities/useEntities'
import { useLoad } from '../../entities/useLoad'
import { formatCoins, hasCoins } from '../../games/coins'
import { describeGameError } from '../../games/gameErrors'
import { Loading } from '../DetailNotice'

const DATE_TIME = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

interface Progress {
  total: number
  done: number
}
interface Outcome {
  total: number
  removed: number
  failed: { id: number; message: string }[]
}

function ConfirmDelete({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <ModalShell title="Eliminar tiradas" onClose={onClose}>
      <p className="text-sm text-txt-secondary mb-5">
        {count === 1 ? 'Vas a eliminar 1 tirada del registro.' : `Vas a eliminar ${count} tiradas del registro.`} Esta acción no se puede deshacer y no
        devuelve los premios ya entregados.
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={btnDanger} onClick={onConfirm}>
          Eliminar {count === 1 ? '1 tirada' : `${count} tiradas`}
        </button>
      </div>
    </ModalShell>
  )
}

/** Game log of the campaign (DM sees every play) with select-all and bulk delete. */
export function GameLogsSettings() {
  const { layer, campaignId } = useCampaignServices()
  const logsState = useLoad(() => layer.games.listLogs(campaignId), `game-logs:${campaignId}`)
  const pjs = useEntities('pjs')
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const logs = useMemo(() => (logsState.data ?? []).filter((l) => !gone.has(l.id)), [logsState.data, gone])
  const running = progress !== null
  const allSelected = logs.length > 0 && logs.every((l) => selected.has(l.id))
  const selectedCount = logs.filter((l) => selected.has(l.id)).length

  const nameOf = (log: GameLog) => {
    if (log.actor_type === 'dm') return 'DM'
    const pj = pjs.items.find((p) => p.id === log.character_id)
    return String(pj?.nombre ?? `Personaje #${log.character_id}`)
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    const ids = logs.filter((l) => selected.has(l.id)).map((l) => l.id)
    setConfirming(false)
    setOutcome(null)
    setProgress({ total: ids.length, done: 0 })
    const failed: Outcome['failed'] = []
    const removedIds: number[] = []
    for (const id of ids) {
      try {
        await layer.games.removeLog(id)
        removedIds.push(id)
      } catch (e) {
        // already gone (deleted from another tab): the goal of the request is met
        if (e instanceof DataError && e.kind === 'not_found') removedIds.push(id)
        else failed.push({ id, message: e instanceof DataError && e.reason ? describeGameError(e) : describeDataError(e, 'No se pudo eliminar.') })
      }
      if (mounted.current) setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    }
    if (!mounted.current) return
    setGone((prev) => new Set([...prev, ...removedIds]))
    setSelected(new Set(failed.map((f) => f.id))) // what could not be deleted stays selected, ready to retry
    setOutcome({ total: ids.length, removed: removedIds.length, failed })
    setProgress(null)
    logsState.refresh()
  }

  if (logsState.status === 'loading' || logsState.status === 'idle') return <Loading />
  if (logsState.status === 'error') {
    return (
      <div className="bg-bg-card border border-border-base px-5 py-4">
        <p role="alert" className="text-[13px] text-red-400 mb-3">
          No pudimos cargar el registro de tiradas.
        </p>
        <button type="button" className={btnSecondary} onClick={logsState.refresh}>
          Reintentar
        </button>
      </div>
    )
  }

  const failedMessages = outcome ? [...new Set(outcome.failed.map((f) => f.message))] : []

  return (
    <div className="flex flex-col gap-3">
      {running && (
        <p role="status" className="text-[13px] text-txt-secondary">
          Eliminando {progress.done} de {progress.total}…
        </p>
      )}
      {outcome && outcome.failed.length === 0 && (
        <p role="status" className="text-[13px] text-accent-bright">
          {outcome.removed === 1 ? 'Se eliminó 1 tirada.' : `Se eliminaron ${outcome.removed} tiradas.`}
        </p>
      )}
      {outcome && outcome.failed.length > 0 && (
        <p role="alert" className="text-[13px] text-red-400">
          Se eliminaron {outcome.removed} de {outcome.total} tiradas. No se pudieron eliminar {outcome.failed.length}: {failedMessages.join(' ')} Siguen
          seleccionadas para que puedas reintentar.
        </p>
      )}

      {logs.length === 0 ? (
        <p className="text-[13px] text-txt-muted italic px-1">Sin tiradas aún.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 min-h-[34px]">
            <span className="text-[12px] text-txt-muted">
              {selectedCount === 0 ? `${logs.length} tiradas` : selectedCount === 1 ? '1 seleccionada' : `${selectedCount} seleccionadas`}
            </span>
            {selectedCount > 0 && (
              <button type="button" className={btnDanger} onClick={() => setConfirming(true)} disabled={running}>
                <Trash2 size={13} aria-hidden="true" />
                Eliminar seleccionadas ({selectedCount})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-[12px] text-txt-secondary border-collapse">
                <thead className="sticky top-0 bg-bg-base z-10">
                  <tr className="border-b border-border-base font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted">
                    <th className="py-2 pr-3 pl-1">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las tiradas"
                        checked={allSelected}
                        disabled={running}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(logs.map((l) => l.id)))}
                      />
                    </th>
                    <th className="text-left py-2 pr-4 font-semibold">Actor</th>
                    <th className="text-left py-2 pr-4 font-semibold">Tirada</th>
                    <th className="text-left py-2 pr-4 font-semibold">Premio</th>
                    <th className="text-left py-2 pr-4 font-semibold">Destino</th>
                    <th className="text-left py-2 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className={`border-b border-border-base/50 transition-colors ${selected.has(log.id) ? 'bg-accent/5' : 'hover:bg-bg-mid/40'}`}>
                      <td className="py-2 pr-3 pl-1">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar la tirada de ${nameOf(log)} del ${log.play_date}`}
                          checked={selected.has(log.id)}
                          disabled={running}
                          onChange={() => toggle(log.id)}
                        />
                      </td>
                      <td className="py-2 pr-4 font-semibold text-txt-primary">{nameOf(log)}</td>
                      <td className="py-2 pr-4">{log.roll}</td>
                      <td className="py-2 pr-4 text-accent-bright">{hasCoins(log.prize) ? formatCoins(log.prize) : '—'}</td>
                      <td className="py-2 pr-4">{log.prize_target === 'pot' ? 'Pozo' : 'Jugador'}</td>
                      <td className="py-2">{DATE_TIME.format(new Date(log.created_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {confirming && <ConfirmDelete count={selectedCount} onConfirm={deleteSelected} onClose={() => setConfirming(false)} />}
    </div>
  )
}
