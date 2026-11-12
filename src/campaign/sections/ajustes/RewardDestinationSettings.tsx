import { useId, useState } from 'react'
import { inputCls } from '../../../constants'
import { economyItems, rewardKey, setRewardByKey } from '../../system/builder/economy'
import { parseSystemProfile } from '../../system/systemProfile'
import { EconomyLink } from './EconomyLink'
import { countChanges } from './tabSave/dirty'
import { useTabSaveBlock } from './tabSave/useTabSaveBlock'
import { useCampaignSave } from './useCampaignSave'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

interface Option {
  id: string
  label: string
}

function DestinationForm({ initial, options, onSave }: { initial: string; options: Option[]; onSave: (choice: string) => Promise<void> }) {
  const id = useId()
  const [choice, setChoice] = useState(initial)
  useTabSaveBlock({
    key: 'destino',
    label: 'Destino de recompensa',
    order: 5,
    dirtyCount: countChanges(initial, choice),
    save: () => onSave(choice),
    discard: () => setChoice(initial),
  })
  return (
    <div className="bg-bg-card border border-border-base px-5 py-4 max-w-[460px]">
      <label htmlFor={id} className={labelCls}>
        Destino de recompensa
      </label>
      <select id={id} aria-describedby={`${id}-hint`} className={inputCls} value={choice} onChange={(e) => setChoice(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value="">Ninguno</option>
      </select>
      <p id={`${id}-hint`} className="text-[12px] text-txt-muted mt-1.5">
        Donde se acreditan la lotería, el pozo y las recompensas. Las instancias se crean en <EconomyLink />. Sin destino, la lotería no aparece en Juegos.
      </p>
    </div>
  )
}

/**
 * Which economy instance receives the lottery, the pot and the rewards (S28; exactly one, or none). The only place that sets it:
 * the sheet builder no longer does. It writes `system_profile.sheet` with only the flag changed, over the document as it is when
 * the save runs (so a template or economy saved meanwhile is kept). Nothing for a campaign without a coin table: it keeps the
 * classic coins.
 */
export function RewardDestinationSettings() {
  const { campaign, latest, notice, setNotice, saves, saveSystem, fail } = useCampaignSave()
  const sheet = parseSystemProfile(campaign.system_profile).sheet ?? null
  const instances = economyItems(sheet)
  if (!sheet || !instances.some((e) => e.item.type === 'monedas')) return null
  const options: Option[] = instances.map(({ item }) => ({ id: String(item.key), label: String(item.label) }))
  const stored = rewardKey(sheet) ?? ''

  async function onSave(choice: string): Promise<void> {
    setNotice(null)
    const current: unknown = latest().system_profile
    const base = isRecord(current) && current.version === 1 ? current : parseSystemProfile(current)
    const now = isRecord(base.sheet) ? base.sheet : null
    if (!now) return fail('La campaña no tiene plantilla de ficha.')
    if (choice !== '' && !economyItems(now).some((e) => e.item.key === choice)) return fail('Esa instancia ya no existe: elegí otra.')
    await saveSystem({ ...base, sheet: setRewardByKey(now, choice === '' ? null : choice) }, 'Destino de recompensa guardado.', 'No se pudo guardar el destino de recompensa. Intentá de nuevo.')
  }

  return (
    <div className="flex flex-col gap-2">
      <DestinationForm key={`${saves}:${stored}:${options.map((o) => o.id).join(',')}`} initial={stored} options={options} onSave={onSave} />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
