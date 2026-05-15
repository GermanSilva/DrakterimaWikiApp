import { regionLabel, relacionLabel } from '../helpers'

export function Tag({ cls, text }) {
  return <span className={`tag tag-${cls}`}>{text}</span>
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
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{text}</div>
    </div>
  )
}

export function FilterPills({ options, value, onChange }) {
  return (
    <div className="filter-pills">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`pill ${value === opt.value ? 'active' : ''}`}
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
    <div className="page-header">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <div className="page-title">{title}</div>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>{children}</div>
    </div>
  )
}
