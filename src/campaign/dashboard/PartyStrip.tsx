import { Link } from 'react-router'
import type { FlatEntity } from '../../data'
import { entityPath } from '../navigation'
import { str } from '../sections/format'
import type { SystemProfile } from '../system/systemProfile'
import { CardLink, DashCard, StatusText } from './DashCard'
import { linkFocus } from './uiHelpers'
import { Portrait } from './Portrait'
import type { SourceStatus } from './useDashboardSources'

export interface PartyStripProps {
  slug: string
  party: FlatEntity[]
  myCharacterIds: number[]
  system: SystemProfile
  status: SourceStatus
}

/** One fixed-size tile per visible character: the grid never stretches them to fill the row. */
export function PartyStrip({ slug, party, myCharacterIds, system, status }: PartyStripProps) {
  const { clase, nivel } = system.character.builtins
  return (
    <DashCard id="panel-party" title="El grupo" action={<CardLink to={entityPath(slug, 'pjs')}>Jugadores →</CardLink>}>
      {party.length === 0 ? (
        <StatusText status={status} empty="Todavía no hay personajes." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,140px)] gap-2">
          {party.map((pj) => {
            const name = str(pj.nombre) || `#${pj.id}`
            const mine = myCharacterIds.includes(pj.id)
            const detail = [clase.enabled && str(pj.clase), nivel.enabled && pj.nivel != null && String(pj.nivel)].filter(Boolean).join(' · ')
            return (
              <Link
                key={pj.id}
                to={entityPath(slug, 'pjs', pj.id)}
                data-mine={mine ? 'true' : undefined}
                className={`flex min-w-0 items-center gap-2 border p-2 text-[12.5px] hover:border-accent-dim hover:bg-bg-card-hover ${mine ? 'border-accent-dim' : 'border-border-base'} ${linkFocus}`}
              >
                <Portrait name={name} url={pj.imagen_url} className="h-[26px] w-[26px] shrink-0 text-[11px]" />
                <span className="min-w-0 truncate text-txt-primary">
                  {name}
                  {detail && <small className="block truncate text-[11px] text-txt-secondary">{detail}</small>}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </DashCard>
  )
}
