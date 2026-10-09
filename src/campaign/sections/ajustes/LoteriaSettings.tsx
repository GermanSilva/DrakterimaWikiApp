import { useState, type FormEvent } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { ConflictError, type CampaignConfig, type Coins } from '../../../data'
import { describeDataError } from '../../entities/errorMessages'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useLoad } from '../../entities/useLoad'
import { parseLoteriaConfig } from '../../games/coins'
import { Loading } from '../DetailNotice'
import { coinText, parseCoinText, type CoinText } from './coinInput'
import { CoinFields } from './CoinFields'

const MIN_ROLL = 1
const MAX_ROLL = 19

interface LoteriaValues {
  commonMinRoll: number
  commonPrize: Coins
  specialPrize: Coins
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
  const [minRoll, setMinRoll] = useState(String(initial.commonMinRoll))
  const [common, setCommon] = useState<CoinText>(() => coinText(initial.commonPrize))
  const [special, setSpecial] = useState<CoinText>(() => coinText(initial.specialPrize))
  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const min = Number(minRoll)
    if (minRoll.trim() === '' || !Number.isInteger(min) || min < MIN_ROLL || min > MAX_ROLL) {
      setInvalid(`La tirada mínima debe ser un número entero entre ${MIN_ROLL} y ${MAX_ROLL}.`)
      return
    }
    const commonPrize = parseCoinText(common)
    const specialPrize = parseCoinText(special)
    if (!commonPrize || !specialPrize) {
      setInvalid('Los premios deben ser números enteros de 0 o más.')
      return
    }
    setInvalid(null)
    setSaving(true)
    try {
      await onSave({ commonMinRoll: min, commonPrize, specialPrize }, row?.updated_at ?? null)
    } finally {
      setSaving(false)
    }
  }

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
      <div>
        <button type="submit" className={btnSecondary} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </form>
  )
}

/** Lottery configuration (`campaign_config.loteria`, readable by members, written by the DM). */
export function LoteriaSettings() {
  const { layer, campaignId } = useCampaignServices()
  const state = useLoad(() => layer.config.get(campaignId, 'loteria'), `loteria-config:${campaignId}`)
  // The row we wrote last, valid only for the loaded version it was based on: a re-read supersedes it.
  const [saved, setSaved] = useState<{ row: CampaignConfig; over: CampaignConfig | null } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

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

  async function save(values: LoteriaValues, base: string | null) {
    setNotice(null)
    try {
      const next = await layer.config.patch(campaignId, 'loteria', values as unknown as Record<string, unknown>, 'members', base)
      setSaved({ row: next, over: state.data })
      setNotice({ kind: 'ok', text: 'Configuración guardada.' })
    } catch (e) {
      if (e instanceof ConflictError) {
        setNotice({
          kind: 'error',
          text: 'La configuración cambió mientras la editabas. Cargamos los valores actuales: revisalos y guardá de nuevo.',
        })
        state.refresh()
      } else {
        setNotice({ kind: 'error', text: describeDataError(e, 'No se pudo guardar la configuración. Intentá de nuevo.') })
      }
    }
  }

  return <LoteriaForm key={row?.updated_at ?? 'none'} row={row} notice={notice} onSave={save} />
}
