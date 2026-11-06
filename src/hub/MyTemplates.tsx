import { useState } from 'react'
import { btnNeutral } from '../constants'
import { SystemNameDialog } from '../campaign/sections/ajustes/SystemNameDialog'
import { KIND_LABEL, lineageText, systemDate } from '../campaign/sections/ajustes/systemLabels'
import type { CampaignWithRole, SystemSummary } from '../data'

export interface MyTemplatesProps {
  /** Homebrew of my campaigns and my frozen copies (see myTemplates). */
  templates: SystemSummary[]
  /** Every system the user can read, to name the lineage. */
  known: SystemSummary[]
  campaigns: CampaignWithRole[]
  userId: string | null
  onRename: (systemId: string, name: string) => Promise<void>
}

/** «Mis plantillas»: the bases a DM can pick for a new campaign request. Only the creator renames; nothing here changes a campaign. */
export function MyTemplates({ templates, known, campaigns, userId, onRename }: MyTemplatesProps) {
  const [renaming, setRenaming] = useState<SystemSummary | null>(null)
  if (templates.length === 0) return null
  return (
    <section aria-label="Mis plantillas" className="mt-10 pt-6 border-t border-border-base">
      <h2 className="font-exo text-[13px] font-semibold tracking-[0.2em] uppercase text-accent-bright mb-3">Mis plantillas</h2>
      <p className="text-xs text-txt-muted mb-3">
        Homebrew de tus campañas y copias congeladas de campañas que dejaste de dirigir. Las podés elegir como base al solicitar una campaña.
      </p>
      <ul className="grid gap-3">
        {templates.map((s) => {
          const campaign = s.campaign_id ? campaigns.find((c) => c.id === s.campaign_id) : undefined
          const lineage = lineageText(s, known)
          return (
            <li key={s.id} className="flex items-center gap-4 bg-bg-card border border-border-base p-4">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="font-exo text-sm font-semibold tracking-[0.08em] text-txt-primary break-words">{s.name}</h3>
                <p>
                  <span className="font-exo text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 border border-border-light text-txt-secondary">{KIND_LABEL[s.kind]}</span>
                </p>
                {campaign && <p className="text-xs text-txt-muted">Campaña: {campaign.name}</p>}
                {lineage && <p className="text-xs text-txt-muted">{lineage}</p>}
                <p className="text-xs text-txt-muted">{`Creado el ${systemDate(s.created_at)}`}</p>
              </div>
              {s.owner_id === userId && (
                <button type="button" className={btnNeutral} aria-label={`Renombrar ${s.name}`} onClick={() => setRenaming(s)}>
                  Renombrar
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {renaming && (
        <SystemNameDialog
          title="Renombrar plantilla"
          initial={renaming.name}
          fallback="No se pudo renombrar la plantilla. Intentá de nuevo."
          onSubmit={(name) => onRename(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </section>
  )
}
