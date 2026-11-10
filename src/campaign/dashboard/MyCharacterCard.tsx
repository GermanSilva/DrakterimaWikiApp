import { Link } from 'react-router'
import type { FlatEntity } from '../../data'
import { entityPath } from '../navigation'
import { str } from '../sections/format'
import type { SystemProfile } from '../system/systemProfile'
import { DashCard, CardLink } from './DashCard'
import { linkFocus } from './uiHelpers'
import { formatEconomy, type EconomySummary } from './economy'
import { Portrait } from './Portrait'

export interface MyCharacterCardProps {
  slug: string
  pj: FlatEntity
  system: SystemProfile
  regionLabel: string
  economy: EconomySummary | null
}

const factCls = 'bg-bg-card px-2.5 py-2'
const factLabelCls = 'mb-0.5 block font-exo text-[9px] uppercase tracking-[0.2em] text-txt-secondary'
const factValueCls = 'block font-exo text-lg tabular-nums text-accent-bright'

export function MyCharacterCard({ slug, pj, system, regionLabel, economy }: MyCharacterCardProps) {
  const { clase, raza, nivel } = system.character.builtins
  const name = str(pj.nombre) || `#${pj.id}`
  const identity = [raza.enabled && str(pj.raza), clase.enabled && str(pj.clase), regionLabel].filter(Boolean).join(' · ')
  const sheet = entityPath(slug, 'pjs', pj.id)
  const accessCls = `flex min-h-8 items-center border-t border-border-base text-txt-secondary first:border-t-0 hover:text-accent-bright ${linkFocus}`
  return (
    <DashCard id="panel-pc" title="Mi personaje" action={<CardLink to={sheet}>Hoja completa →</CardLink>}>
      <div className="grid grid-cols-[112px_1fr] gap-[18px] max-sm:grid-cols-1">
        <div>
          <Portrait testId="pc-portrait" name={name} url={pj.imagen_url} className="h-[140px] text-[40px]" />
          <nav aria-label={`Accesos de ${name}`} className="mt-2 flex flex-col font-exo text-[11px] uppercase tracking-[0.12em]">
            <Link to={sheet} className={accessCls}>Ver ficha</Link>
            <Link to={entityPath(slug, 'notas')} className={accessCls}>Mis notas</Link>
            <Link to={entityPath(slug, 'calendario')} className={accessCls}>Mi disponibilidad</Link>
          </nav>
        </div>
        <div className="min-w-0">
          <h3 className="font-exo text-xl font-bold uppercase text-txt-primary">{name}</h3>
          {identity && <p className="mb-3.5 mt-0.5 text-[13px] text-txt-secondary">{identity}</p>}
          <div className={`grid gap-px border border-border-base bg-border-base ${nivel.enabled && economy ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}>
            {nivel.enabled && (
              <div className={factCls}>
                <span className={factLabelCls}>{nivel.label}</span>
                <b className={factValueCls}>{String(pj.nivel ?? '—')}</b>
              </div>
            )}
            {economy && (
              <div className={factCls}>
                <span className={factLabelCls}>Economía total</span>
                <b className={factValueCls}>
                  {formatEconomy(economy.total)}
                  <span className="ml-1 text-xs font-normal text-txt-secondary">{economy.unit}</span>
                </b>
                {economy.saved !== null && (
                  <small className="mt-0.5 block text-[11px] text-txt-secondary">{`${formatEconomy(economy.onHand)} ${economy.unit} encima · ${formatEconomy(economy.saved)} ${economy.unit} guardado`}</small>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashCard>
  )
}
