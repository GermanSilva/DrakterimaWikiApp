import { useCampaign } from './CampaignContext'
import type { SectionPageProps } from './sections'

/** Stand-in for every section until H7-H9 port the real pages. */
export function SectionPlaceholder({ section, id }: SectionPageProps) {
  const { campaign } = useCampaign()
  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">{section.label}</h1>
      <p className="text-sm text-txt-secondary">
        Esta sección se está migrando. Pronto vas a verla acá.
      </p>
      <dl className="mt-4 text-xs text-txt-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Campaña</dt>
        <dd>{campaign.slug}</dd>
        <dt>Sección</dt>
        <dd>{section.key}</dd>
        {id !== undefined && (
          <>
            <dt>Id</dt>
            <dd>{id}</dd>
          </>
        )}
      </dl>
    </>
  )
}
