import { useMemo, useState, type FormEvent } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { ConflictError, type CampaignConfig, type Coins } from '../../../data'
import { describeDataError } from '../../entities/errorMessages'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useLoad } from '../../entities/useLoad'
import { parseLoteriaConfig, staleLoteriaKeys } from '../../games/coins'
import { rewardTarget } from '../../system/coins/rewardTarget'
import { useSystem } from '../../system/useSystem'
import { Loading } from '../DetailNotice'
import { coinText, parseCoinText, type CoinText } from './coinInput'
import { CoinFields } from './CoinFields'
import { MAX_ROLL, MIN_ROLL, SheetLoteriaForm } from './SheetLoteriaForm'
import { countChanges } from './tabSave/dirty'
import { BlockSaveError } from './tabSave/tabSaveContext'
import { useTabSaveBlock } from './tabSave/useTabSaveBlock'

interface LoteriaValues {
  commonMinRoll: number
  commonPrize: Coins | Record<string, number>
  specialPrize: Coins | Record<string, number>
}

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

function LoteriaForm({
  row,
  notice,
  onSave,
}: {
  row: CampaignConfig | null
  notice: Notice | null
  onSave: (values: LoteriaValues, base: string | null) => Promise<void>
}) {
  const initial = parseLoteriaConfig(row?.value)
  const start = { minRoll: String(initial.commonMinRoll), common: coinText(initial.commonPrize), special: coinText(initial.specialPrize) }
  const [minRoll, setMinRoll] = useState(start.minRoll)
  const [common, setCommon] = useState<CoinText>(start.common)
  const [special, setSpecial] = useState<CoinText>(start.special)
  const [invalid, setInvalid] = useState<string | null>(null)

  useTabSaveBlock({
    key: 'loteria',
    label: 'Lotería',
    order: 10,
    dirtyCount: countChanges(start, { minRoll, common, special }),
    async save() {
      const refuse = (text: string): never => {
        setInvalid(text)
        throw new BlockSaveError(text)
      }
      const min = Number(minRoll)
      if (minRoll.trim() === '' || !Number.isInteger(min) || min < MIN_ROLL || min > MAX_ROLL) {
        refuse(`La tirada mínima debe ser un número entero entre ${MIN_ROLL} y ${MAX_ROLL}.`)
      }
      const commonPrize = parseCoinText(common)
      const specialPrize = parseCoinText(special)
      if (!commonPrize || !specialPrize) return refuse('Los premios deben ser números enteros de 0 o más.')
      setInvalid(null)
      await onSave({ commonMinRoll: min, commonPrize, specialPrize }, row?.updated_at ?? null)
    },
    discard() {
      setMinRoll(start.minRoll)
      setCommon(start.common)
      setSpecial(start.special)
      setInvalid(null)
    },
  })

  // The tab's save bar saves; Enter in a field must not submit anything by itself.
  const submit = (e: FormEvent) => e.preventDefault()

  return (
    <form noValidate onSubmit={submit} className="bg-bg-card border border-border-base px-5 py-4 flex flex-col gap-4" aria-label="Configuración de la lotería">
      <div>
        <label htmlFor="loteria-min-roll" className="block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5">
          Tirada mínima para el premio común ({MIN_ROLL}-{MAX_ROLL})
        </label>
        <input
          id="loteria-min-roll"
          type="number"
          inputMode="numeric"
          min={MIN_ROLL}
          max={MAX_ROLL}
          step={1}
          value={minRoll}
          onChange={(e) => setMinRoll(e.target.value)}
          className={inputCls + ' !w-24'}
        />
      </div>
      <CoinFields legend="Premio común" value={common} onChange={setCommon} />
      <CoinFields legend="Premio especial (20 natural)" value={special} onChange={setSpecial} />
      {invalid && (
        <p role="alert" className="text-[13px] text-red-400">
          {invalid}
        </p>
      )}
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
    </form>
  )
}

/** Lottery configuration (`campaign_config.loteria`, readable by members, written by the DM). */
export function LoteriaSettings() {
  const { layer, campaignId } = useCampaignServices()
  // S12/S28: with a sheet the prizes are defined per denomination of its coin table, and only once it has a reward destination
  const system = useSystem()
  const target = useMemo(() => rewardTarget(system.sheet), [system.sheet])
  const state = useLoad(() => layer.config.get(campaignId, 'loteria'), `loteria-config:${campaignId}`)
  // The row we wrote last, valid only for the loaded version it was based on: a re-read supersedes it.
  const [saved, setSaved] = useState<{ row: CampaignConfig; over: CampaignConfig | null } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  if (target.mode === 'none') {
    return (
      <div className="bg-bg-card border border-border-base px-5 py-4">
        <p className="text-[13px] text-txt-muted">
          Definí las denominaciones de la moneda y marcá un destino de recompensa en la hoja de la campaña para poder definir los premios de la lotería.
        </p>
      </div>
    )
  }
  if (state.status === 'loading' || state.status === 'idle') return <Loading />
  if (state.status === 'error') {
    return (
      <div className="bg-bg-card border border-border-base px-5 py-4">
        <p role="alert" className="text-[13px] text-red-400 mb-3">
          No pudimos cargar la configuración de la lotería. No se puede editar hasta que cargue.
        </p>
        <button type="button" className={btnSecondary} onClick={state.refresh}>
          Reintentar
        </button>
      </div>
    )
  }

  const row = saved && saved.over === state.data ? saved.row : state.data

  /** Writes the prizes; a failure shows its notice and is thrown as a `BlockSaveError` for the tab's save bar. */
  async function save(values: LoteriaValues, base: string | null) {
    setNotice(null)
    const stop = (text: string): never => {
      setNotice({ kind: 'error', text })
      throw new BlockSaveError(text)
    }
    try {
      const next = await layer.config.patch(campaignId, 'loteria', values as unknown as Record<string, unknown>, 'members', base)
      setSaved({ row: next, over: state.data })
      setNotice({ kind: 'ok', text: 'Configuración guardada.' })
    } catch (e) {
      if (e instanceof ConflictError) {
        state.refresh()
        stop('La configuración cambió mientras la editabas. Cargamos los valores actuales: revisalos y guardá de nuevo.')
      }
      stop(describeDataError(e, 'No se pudo guardar la configuración. Intentá de nuevo.'))
    }
  }

  if (target.mode === 'monedas' || target.mode === 'economia') {
    const stale = staleLoteriaKeys(row?.value, target.denominations)
    return (
      <div className="flex flex-col gap-3">
        {stale.length > 0 && (
          <div role="alert" aria-label="Premios desactualizados" className="border border-red-400/60 px-5 py-3 text-[13px] text-red-400">
            Los premios guardados usan monedas que ya no existen en la hoja ({stale.join(', ')}), por eso la lotería no está disponible para los jugadores.
            Guardá los premios de nuevo con las denominaciones actuales para activarla.
          </div>
        )}
        <SheetLoteriaForm key={row?.updated_at ?? 'none'} row={row} denominations={target.denominations} notice={notice} onSave={save} />
      </div>
    )
  }
  return <LoteriaForm key={row?.updated_at ?? 'none'} row={row} notice={notice} onSave={save} />
}
