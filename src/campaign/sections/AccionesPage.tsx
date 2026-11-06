import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState, PageHeader } from '../../components/Shared'
import { btnPrimary, btnSecondary, inputCls } from '../../constants'
import type { CampaignAction } from '../../data'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { describeDataError } from '../entities/errorMessages'
import { useEntities } from '../entities/useEntities'
import { actionTablesOf, groupByCategory } from '../system/actions/tables'
import { useSystem } from '../system/useSystem'
import { ActionForm } from './acciones/ActionForm'
import { useActionCollection } from './acciones/useActionCollection'
import { Loading } from './DetailNotice'
import { DmNotice } from './DmNotice'
import { str } from './format'

const includesText = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.trim().toLowerCase())

/**
 * DM catalogue of the shared action collection (S35-S37): the entries grouped by Habilidad table and category, searchable by
 * name, with create / edit / delete. Functions (S22) are not edited here. The registry only mounts it for the DM of a campaign
 * whose sheet has a Habilidad table.
 */
export function AccionesPage() {
  const system = useSystem()
  const tables = useMemo(() => actionTablesOf(system), [system])
  const { layer } = useCampaignServices()
  const collection = useActionCollection()
  const pjs = useEntities('pjs')
  const characters = useMemo(() => pjs.items.map((p) => ({ id: p.id, nombre: str(p.nombre) })), [pjs.items])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CampaignAction | 'new' | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const visible = collection.items.filter((a) => query.trim() === '' || includesText(a.name, query))
  const nameOf = (id: number) => characters.find((c) => c.id === id)?.nombre ?? `personaje ${id}`

  async function remove(entry: CampaignAction) {
    if (!confirm(`¿Eliminar "${entry.name}"? Se desvincula de todos los personajes.`)) return
    setDeleteError(null)
    try {
      await layer.actions.removeAction(entry.id)
      await collection.reload()
    } catch (err) {
      console.error('No se pudo eliminar la acción', err)
      setDeleteError(describeDataError(err, 'No se pudo eliminar la acción. Intentá de nuevo.'))
    }
  }

  return (
    <>
      <PageHeader eyebrow="Personajes" title="Acciones" subtitle="Catálogo compartido de la campaña: los personajes enlazan las entradas." titleAs="h1">
        <button type="button" className={`${btnPrimary} flex items-center gap-1.5`} onClick={() => setEditing('new')}>
          <Plus size={13} aria-hidden="true" /> Nueva acción
        </button>
      </PageHeader>

      {editing && (
        <ActionForm
          key={editing === 'new' ? 'new' : editing.id}
          tables={tables}
          characters={characters}
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void collection.reload()
          }}
        />
      )}

      <input type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre…" className={`${inputCls} mb-5 max-w-sm`} value={query} onChange={(e) => setQuery(e.target.value)} />
      {deleteError && (
        <p role="alert" className="text-[13px] text-accent-bright mb-3">
          {deleteError}
        </p>
      )}

      {collection.status === 'loading' && collection.items.length === 0 && <Loading />}
      {collection.status === 'error' && <DmNotice onRetry={collection.retry}>No pudimos cargar las acciones.</DmNotice>}
      {collection.status === 'ready' && collection.items.length === 0 && <EmptyState icon="✦" title="Sin acciones" text="Todavía no hay acciones en el catálogo." />}
      {collection.items.length > 0 && visible.length === 0 && <EmptyState icon="✦" title="Sin resultados" text="Ninguna acción coincide con la búsqueda." />}

      {tables.map((table) => {
        const entries = visible.filter((a) => a.table_key === table.key)
        if (entries.length === 0) return null
        return (
          <section key={table.key} aria-label={table.label} className="mb-8">
            <h2 className="font-exo text-[13px] font-bold tracking-[0.15em] uppercase text-txt-primary mb-3">{table.label}</h2>
            {groupByCategory(table, entries, (a) => a.category).map((group) => (
              <section key={group.key ?? group.label} aria-label={group.label} className="mb-4">
                <h3 className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted mb-1.5">{group.label}</h3>
                <ul className="divide-y divide-border-base border border-border-base bg-bg-mid">
                  {group.items.map((entry) => (
                    <li key={entry.id} data-name={entry.name} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[13px] text-txt-primary">{entry.name}</div>
                        {entry.private_to_pj !== null && <div className="text-[11px] text-txt-muted">Privada de {nameOf(entry.private_to_pj)}</div>}
                        {entry.description !== '' && <div className="text-[12px] text-txt-secondary truncate">{entry.description}</div>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" className={btnSecondary} aria-label={`Editar ${entry.name}`} onClick={() => setEditing(entry)}>
                          Editar
                        </button>
                        <button type="button" className={btnSecondary} aria-label={`Eliminar ${entry.name}`} onClick={() => void remove(entry)}>
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        )
      })}
    </>
  )
}
