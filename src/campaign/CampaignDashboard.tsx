import { useCampaign } from './CampaignContext'
import { countVisible, lastSession, localToday, nextSessionSlot, recentArticles, recentPnjs, type ArticleTable } from './dashboard/dashboardData'
import { ArticleList, PanelSection, PnjTiles, SessionTiles } from './dashboard/PanelSections'
import { PanelHeader } from './dashboard/PanelHeader'
import { STAT_DEFS } from './dashboard/statDefs'
import { StatsRow } from './dashboard/StatsRow'
import { useDisponibilidad } from './entities/useDisponibilidad'
import { useEntities } from './entities/useEntities'

/** Landing page of a campaign: header, compact stats, sessions, recent PNJs and recent articles. */
export function CampaignDashboard() {
  const { campaign, isDM } = useCampaign()
  const sesiones = useEntities('sesiones')
  const pjs = useEntities('pjs')
  const pnjs = useEntities('pnjs')
  const lugares = useEntities('lugares')
  const facciones = useEntities('facciones')
  const lore = useEntities('lore')
  const items = useEntities('items')
  const slots = useDisponibilidad()

  const lists = { sesiones, pjs, pnjs, lugares, facciones, lore } as const
  const stats = STAT_DEFS.map((def) => {
    const list = lists[def.key as keyof typeof lists]
    const ready = !list.loading && !list.error
    return { ...def, value: ready ? countVisible(list.items, isDM, { withoutAvances: def.key === 'sesiones' }) : null }
  })

  const last = lastSession(sesiones.items, isDM)
  const next = nextSessionSlot(slots.items, localToday())
  const lastNumero = sesiones.items.reduce((max, s) => (s.tipo !== 'avance' && Number(s.numero) > max ? Number(s.numero) : max), 0)
  const articleTables: Record<ArticleTable, typeof lugares.items> = { lugares: lugares.items, facciones: facciones.items, lore: lore.items, items: items.items }

  return (
    <>
      <PanelHeader name={campaign.name} slug={campaign.slug} branding={campaign.branding} isDM={isDM} />
      <StatsRow slug={campaign.slug} stats={stats} />
      <PanelSection id="panel-sesiones" title="Sesiones">
        <SessionTiles slug={campaign.slug} last={last} next={next} nextNumber={lastNumero + 1} />
      </PanelSection>
      <PanelSection id="panel-pnjs" title="PNJs recientes">
        <PnjTiles slug={campaign.slug} pnjs={recentPnjs(pnjs.items, isDM)} />
      </PanelSection>
      <PanelSection id="panel-articulos" title="Últimos artículos">
        <ArticleList slug={campaign.slug} articles={recentArticles(articleTables, isDM)} />
      </PanelSection>
    </>
  )
}
