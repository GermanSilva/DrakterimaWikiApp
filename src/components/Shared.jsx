import { regionLabel, relacionLabel } from '../helpers'

const TAG_STYLES = {
  magral: 'border-[#2a4a2a] text-[#60946a] bg-[rgba(42,74,42,0.12)]',
  nezor: 'border-[#5a3a15] text-[#a86830] bg-[rgba(90,58,21,0.12)]',
  heladas: 'border-[#1a3855] text-[#5080a8] bg-[rgba(26,56,85,0.12)]',
  islas: 'border-[#363650] text-[#7070a0] bg-[rgba(54,54,80,0.12)]',
  orden: 'border-[#383015] text-[#887830] bg-[rgba(56,48,21,0.12)]',
  legion: 'border-[#1a2535] text-[#486090] bg-[rgba(26,37,53,0.12)]',
  culto: 'border-accent-dim text-accent-bright bg-[rgba(220,38,38,0.08)]',
  gremio: 'border-[#283828] text-[#587858] bg-[rgba(40,56,40,0.12)]',
  neutral: 'border-border-light text-txt-muted bg-transparent',
  aliado: 'border-[#1a3a1a] text-[#487848] bg-[rgba(26,58,26,0.10)]',
  enemigo: 'border-accent-dim text-accent bg-[rgba(220,38,38,0.07)]',
  pj: 'border-[#1a3050] text-[#4878a8] bg-[rgba(26,48,80,0.12)]',
  borrador: 'border-[#4a3800] text-[#a08020] bg-[rgba(74,56,0,0.12)]',
  secreto: 'border-[#3a1a55] text-[#8850c0] bg-[rgba(58,26,85,0.12)]',
}

export function Tag({ cls, text }) {
  const styles = TAG_STYLES[cls] || TAG_STYLES.neutral
  return (
    <span className={`font-exo text-[9px] font-semibold tracking-[0.1em] uppercase px-2 py-0.5 border inline-block w-fit ${styles}`}>
      {text}
    </span>
  )
}

export function RegionTag({ region }) {
  const clsMap = { magral: 'magral', nezor: 'nezor', heladas: 'heladas', islas: 'islas', otro: 'neutral' }
  return <Tag cls={clsMap[region] || 'neutral'} text={regionLabel[region] || region} />
}

export function RelacionTag({ relacion }) {
  const clsMap = { aliado: 'aliado', enemigo: 'enemigo', neutral: 'neutral', desconocido: 'neutral' }
  return <Tag cls={clsMap[relacion] || 'neutral'} text={relacionLabel[relacion] || relacion} />
}

export function EmptyState({ icon, title, text }) {
  return (
    <div className="text-center py-[60px] px-5 text-txt-muted">
      <div className="text-[40px] mb-4 opacity-25">{icon}</div>
      <div className="font-exo text-[13px] font-semibold tracking-[0.1em] uppercase mb-2 text-txt-secondary">
        {title}
      </div>
      <div className="text-sm italic">{text}</div>
    </div>
  )
}

export function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-[18px]">
      {options.map(opt => (
        <button
          key={opt.value}
          className={[
            'font-exo text-[9px] font-semibold tracking-[0.15em] uppercase px-3 py-1 border cursor-pointer transition-all bg-transparent',
            value === opt.value
              ? 'border-accent text-accent-bright bg-accent/[.1]'
              : 'border-border-base text-txt-muted hover:border-accent-dim hover:text-txt-secondary',
          ].join(' ')}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="mb-7 pb-5 border-b border-border-base flex items-end justify-between gap-4">
      <div>
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          {eyebrow}
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase max-md:text-[20px]">
          {title}
        </div>
        {subtitle && (
          <div className="text-sm text-txt-secondary italic mt-1">{subtitle}</div>
        )}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}
