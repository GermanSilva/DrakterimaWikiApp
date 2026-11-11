/** Helpers every item editor uses: read/patch one node of the draft, a number input. */
import { useId, useState } from 'react'
import { inputCls } from '../../../constants'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

/** A number typed by the DM: empty removes it, text that is not a number is not committed (what was typed stays on screen until blur). */
export function NumberInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number | undefined) => void }) {
  const id = useId()
  const [typed, setTyped] = useState<string | null>(null)
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={typed ?? (typeof value === 'number' ? String(value) : '')}
        onChange={(e) => {
          const raw = e.target.value
          setTyped(raw)
          const parsed = Number(raw.trim().replace(',', '.'))
          if (raw.trim() === '') onChange(undefined)
          else if (Number.isFinite(parsed)) onChange(parsed)
        }}
        onBlur={() => setTyped(null)}
        className={inputCls}
      />
    </div>
  )
}
