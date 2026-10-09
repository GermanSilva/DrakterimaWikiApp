import { inputCls } from '../../../constants'
import { COIN_LABELS, COIN_TYPES } from '../../games/coins'
import type { CoinText } from './coinInput'

/** The five coin inputs of a form, most valuable first. `legend` names the group for assistive tech. */
export function CoinFields({
  legend,
  value,
  onChange,
  disabled = false,
}: {
  legend: string
  value: CoinText
  onChange: (next: CoinText) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5">{legend}</legend>
      <div className="flex gap-2 flex-wrap">
        {COIN_TYPES.map((c) => (
          <label key={c} className="flex flex-col gap-1 text-[11px] text-txt-muted">
            {COIN_LABELS[c]}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={value[c]}
              onChange={(e) => onChange({ ...value, [c]: e.target.value })}
              className={inputCls + ' !w-20'}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
