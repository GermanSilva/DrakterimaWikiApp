import { useState, type FormEvent } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useEntities } from '../../entities/useEntities'
import { useGamePot } from '../../entities/useGamePot'
import { describeGameError } from '../../games/gameErrors'
import { formatCoins, hasCoins } from '../../games/coins'
import { EMPTY_COIN_TEXT, parseCoinText, type CoinText } from './coinInput'
import { CoinFields } from './CoinFields'

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

/** The shared coin pot (realtime) and the DM-only transfer of coins from it to a character. */
export function PotSettings() {
  const { layer, campaignId } = useCampaignServices()
  const { pot, loading, error, reload } = useGamePot()
  const pjs = useEntities('pjs')
  const [pjId, setPjId] = useState('')
  const [amount, setAmount] = useState<CoinText>(EMPTY_COIN_TEXT)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function transfer(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const coins = parseCoinText(amount)
    if (pjId === '') {
      setNotice({ kind: 'error', text: 'Elegí el personaje que recibe las monedas.' })
      return
    }
    if (!coins) {
      setNotice({ kind: 'error', text: 'Las cantidades deben ser números enteros de 0 o más.' })
      return
    }
    if (!hasCoins(coins)) {
      setNotice({ kind: 'error', text: 'Ingresá una cantidad para transferir.' })
      return
    }
    const target = pjs.items.find((p) => p.id === Number(pjId))
    setBusy(true)
    setNotice(null)
    try {
      await layer.games.assignPotToCharacter(campaignId, Number(pjId), coins)
      setAmount(EMPTY_COIN_TEXT)
      setNotice({ kind: 'ok', text: `Se transfirieron ${formatCoins(coins)} a ${String(target?.nombre ?? `personaje #${pjId}`)}.` })
      reload() // the pot may not echo through realtime
    } catch (err) {
      setNotice({ kind: 'error', text: describeGameError(err) })
      reload() // an insufficient pot usually means the one on screen is stale
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-bg-card border border-border-base px-5 py-4 flex flex-col gap-4">
      <div>
        <div className="font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5">Pozo acumulado</div>
        {error ? (
          <p role="alert" className="text-[13px] text-red-400">
            No pudimos cargar el pozo.{' '}
            <button type="button" className="underline cursor-pointer" onClick={reload}>
              Reintentar
            </button>
          </p>
        ) : loading ? (
          <p className="text-[13px] text-txt-muted">Cargando…</p>
        ) : (
          <p aria-label="Pozo acumulado" className="font-exo text-[14px] text-accent-bright font-semibold tracking-[0.04em]">
            {formatCoins(pot, 'Vacío')}
          </p>
        )}
      </div>

      <form noValidate onSubmit={transfer} className="flex flex-col gap-3" aria-label="Transferir del pozo a un personaje">
        <div>
          <label htmlFor="pot-target" className="block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5">
            Transferir al personaje
          </label>
          <select id="pot-target" value={pjId} onChange={(e) => setPjId(e.target.value)} className={inputCls + ' !w-auto min-w-[200px]'} disabled={busy}>
            <option value="">— Elegir personaje —</option>
            {pjs.items.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.nombre ?? `Personaje #${p.id}`)}
              </option>
            ))}
          </select>
        </div>
        <CoinFields legend="Monedas a transferir" value={amount} onChange={setAmount} disabled={busy} />
        {notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
            {notice.text}
          </p>
        )}
        <div>
          <button type="submit" className={btnSecondary} disabled={busy}>
            {busy ? 'Transfiriendo…' : 'Transferir del pozo'}
          </button>
        </div>
      </form>
    </div>
  )
}
