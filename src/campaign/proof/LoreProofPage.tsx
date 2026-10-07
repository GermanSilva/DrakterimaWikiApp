import { useEffect } from 'react'
import { Link } from 'react-router'
import PlayerNotes from '../../components/PlayerNotes'
import UnreadDot from '../../components/UnreadDot'
import WikiText from '../../components/WikiText'
import { btnPrimary, btnSecondary, detailTextCls } from '../../constants'
import { plainText } from '../../helpers'
import { useUnreadPort } from '../../ports'
import { useCampaign } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useEntities } from '../entities/useEntities'
import { useEntity } from '../entities/useEntity'
import { useEntityForm } from '../entityFormContext'
import { entityPath } from '../navigation'
import type { SectionPageProps } from '../sections'

const Heading = ({ children }: { children: string }) => (
  <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-4">{children}</h1>
)

function LoreDetail({ id }: { id: number }) {
  const { campaign, isDM } = useCampaign()
  const { entity, loading, notFound } = useEntity('lore', id)
  const dm = useDmNotes('lore', id)
  const { markRead } = useUnreadPort()
  const { openForm } = useEntityForm()
  const updatedAt = entity?.updated_at
  useEffect(() => {
    if (entity) markRead('lore', entity.id, updatedAt)
    // marks once per entity version; the port is not a dependency on purpose (its identity changes on every mark)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.id, updatedAt])

  if (loading) return <p role="status" className="text-sm text-txt-muted">Cargando…</p>
  if (notFound || !entity) {
    return (
      <>
        <Heading>Lore</Heading>
        <p className="text-sm text-txt-secondary mb-4">Esa entrada no existe o no podés verla.</p>
        <Link to={entityPath(campaign.slug, 'lore')} className={btnSecondary}>← Volver</Link>
      </>
    )
  }
  return (
    <div>
      <div className="flex justify-between mb-6">
        <Link to={entityPath(campaign.slug, 'lore')} className={btnSecondary}>← Volver</Link>
        {isDM && <button className={btnSecondary} onClick={() => openForm({ type: 'lore', id })}>Editar</button>}
      </div>
      <Heading>{String(entity.titulo ?? '')}</Heading>
      <div className={detailTextCls}>
        <WikiText text={String(entity.descripcion ?? '')} />
      </div>
      {isDM && dm.fields.notas && (
        <div className="mt-5 pt-4 border-t-2 border-t-accent">
          <div className="text-xs uppercase text-accent-bright mb-2">Secretos DM</div>
          <div className={detailTextCls}>
            <WikiText text={dm.fields.notas} />
          </div>
        </div>
      )}
      <PlayerNotes entityType="lore" entityId={entity.id} />
    </div>
  )
}

function LoreList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading } = useEntities('lore')
  const { openForm } = useEntityForm()
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Heading>Lore</Heading>
        {isDM && <button className={btnPrimary} onClick={() => openForm({ type: 'lore' })}>+ Nueva Entrada</button>}
      </div>
      {loading ? (
        <p role="status" className="text-sm text-txt-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-txt-secondary">Sin entradas.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {items.map((l) => (
            <Link
              key={l.id}
              to={entityPath(campaign.slug, 'lore', l.id)}
              className="relative block bg-bg-card border border-border-base p-[18px] hover:border-accent-dim"
            >
              <UnreadDot type="lore" id={l.id} updatedAt={l.updated_at} className="absolute top-2 right-2" />
              <div className="font-exo text-[13px] font-semibold text-txt-primary">{String(l.titulo ?? '')}</div>
              <div className="text-[13px] text-txt-secondary italic line-clamp-3 mt-2">
                {plainText(String(l.descripcion ?? ''))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** Thin end-to-end proof of the H7a stack (entity hooks, ports, form host). H7c replaces it with the full Lore port. */
export function LoreProofPage({ id }: SectionPageProps) {
  if (id === undefined) return <LoreList />
  const parsed = /^\d+$/.test(id) ? Number(id) : null
  if (parsed === null) return <LoreList />
  return <LoreDetail id={parsed} />
}
