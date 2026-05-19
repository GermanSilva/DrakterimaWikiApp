import WikiText from '../../../components/WikiText'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../pjConstants'

const PHYSICAL_FIELDS = [
  { key: 'edad', label: 'Edad' },
  { key: 'altura', label: 'Altura' },
  { key: 'peso', label: 'Peso' },
  { key: 'ojos', label: 'Ojos' },
  { key: 'piel', label: 'Piel' },
  { key: 'pelo', label: 'Pelo' },
]

const PERSONALITY_FIELDS = [
  { key: 'personalidad', label: 'Rasgos de Personalidad' },
  { key: 'ideales', label: 'Ideales' },
  { key: 'vinculos', label: 'Vínculos' },
  { key: 'defectos', label: 'Defectos' },
]

export default function PJAppearanceSection({ pj }) {
  const physicalBadges = PHYSICAL_FIELDS.filter(f => pj[f.key])
  const personalityItems = PERSONALITY_FIELDS.filter(f => pj[f.key])

  return (
    <div id="pj-section-apariencia" className={detailSectionCls}>
      <div className={sectionTitleCls}>Apariencia & Personalidad</div>

      {physicalBadges.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {physicalBadges.map(f => (
            <div key={f.key} className="bg-bg-mid border border-border-base px-3 py-1.5">
              <span className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.1em] mr-2">{f.label}</span>
              <span className="text-[13px] text-txt-primary">{pj[f.key]}</span>
            </div>
          ))}
        </div>
      )}

      {pj.apariencia && (
        <div className="mb-4">
          <div className={detailTextCls}><WikiText text={pj.apariencia} /></div>
        </div>
      )}

      {personalityItems.length > 0 && (
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {personalityItems.map(f => (
            <div key={f.key}>
              <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">{f.label}</div>
              <div className={detailTextCls}><WikiText text={pj[f.key]} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
