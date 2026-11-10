import type { SourceStatus } from './useDashboardSources'

export interface GreetingProps {
  name: string
  isDM: boolean
  /** Unread news (player) or things to prepare (DM). */
  count: number
  status: SourceStatus
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function subtitle({ isDM, count, status }: GreetingProps): string {
  if (status !== 'ready') return '—'
  if (isDM) return count === 0 ? 'Nada para preparar' : `${plural(count, 'cosa', 'cosas')} para preparar`
  return count === 0 ? 'Sin novedades desde tu última visita' : `${plural(count, 'novedad', 'novedades')} desde tu última visita`
}

export function Greeting(props: GreetingProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mb-5">
      <h2 className="font-exo text-[26px] font-bold tracking-[0.02em] text-txt-primary">{props.name ? `Hola, ${props.name}` : 'Hola'}</h2>
      <p className="text-sm text-txt-secondary">{subtitle(props)}</p>
    </div>
  )
}
