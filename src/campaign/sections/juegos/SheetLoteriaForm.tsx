import { useState, type FormEvent } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import type { CampaignConfig } from '../../../data'
import { parseSheetLoteriaConfig, type Denomination } from '../../games/coins'

const MIN_ROLL = 1
const MAX_ROLL = 19
const WHOLE = /^\d{1,9}$/

export interface SheetLoteriaValues {
  commonMinRoll: number
  commonPrize: Record<string, number>
  specialPrize: Record<string, number>
}

type PrizeText = Record<string, string>

const prizeText = (amounts: Record<string, number>, denominations: readonly Denomination[]): PrizeText =>
  Object.fromEntries(denominations.map((d) => [d.key, String(amounts[d.key] ?? 0)]))

/** One amount per denomination; an empty input is 0, anything but a whole number of 0 or more is null. */
function parsePrize(text: PrizeText, denominations: readonly Denomination[]): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const d of denominations) {
    const raw = (text[d.key] ?? '').trim()
    if (raw !== '' && !WHOLE.test(raw)) return null
    out[d.key] = raw === '' ? 0 : Number(raw)
  }
  return out
}

function DenominationFields({
  legend, denominations, value, onChange,
}: {
  legend: string
  denominations: readonly Denomination[]
  value: PrizeText
  onChange: (next: PrizeText) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5">{legend}</legend>
      <div className="flex gap-2 flex-wrap">
        {denominations.map((d) => (
          <label key={d.key} className="flex flex-col gap-1 text-[11px] text-txt-muted">
            {d.label}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={value[d.key] ?? '0'}
              onChange={(e) => onChange({ ...value, [d.key]: e.target.value })}
              className={inputCls + ' !w-20'}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * The lottery prize editor of a campaign whose sheet defines the coin denominations (S12, S28): one input per denomination,
 * in the order of the coin table rows, labelled as the sheet labels them. Same contract as the legacy form of Ajustes.
 */
export function SheetLoteriaForm({
  row, denominations, notice, onSave,
}: {
  row: CampaignConfig | null
  denominations: readonly Denomination[]
  notice: { kind: 'ok' | 'error'; text: string } | null
  onSave: (values: SheetLoteriaValues, base: string | null) => Promise<void>
}) {
  const initial = parseSheetLoteriaConfig(row?.value, denominations)
  const [minRoll, setMinRoll] = useState(String(initial.commonMinRoll))
  const [common, setCommon] = useState<PrizeText>(() => prizeText(initial.commonPrize, denominations))
  const [special, setSpecial] = useState<PrizeText>(() => prizeText(initial.specialPrize, denominations))
  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const min = Number(minRoll)
    if (minRoll.trim() === '' || !Number.isInteger(min) || min < MIN_ROLL || min > MAX_ROLL) {
      setInvalid(`La tirada mínima debe ser un número entero entre ${MIN_ROLL} y ${MAX_ROLL}.`)
      return
    }
    const commonPrize = parsePrize(common, denominations)
    const specialPrize = parsePrize(special, denominations)
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
      <DenominationFields legend="Premio común" denominations={denominations} value={common} onChange={setCommon} />
      <DenominationFields legend="Premio especial (20 natural)" denominations={denominations} value={special} onChange={setSpecial} />
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
