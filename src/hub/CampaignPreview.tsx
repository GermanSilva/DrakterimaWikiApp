import { useState } from 'react'
import { accentStyle, parseHttpsUrl } from '../campaign/branding'
import { BrandMark } from '../components/BrandMark'

export const PREVIEW_NAME_PLACEHOLDER = 'Nueva campaña'
export const PREVIEW_TAGLINE_PLACEHOLDER = 'RPG Quester presenta'

/** Header of the request / create dialogs: how the campaign tile will look with what has been typed so far. */
export function CampaignPreview({ name, tagline, accent, logo }: { name: string; tagline: string; accent: string; logo: string }) {
  const logoUrl = parseHttpsUrl(logo.trim())
  // An image that fails to load falls back to the brand mark (keyed by URL so a new address is tried again).
  const [broken, setBroken] = useState<string | null>(null)
  const showLogo = logoUrl !== null && broken !== logoUrl
  const trimmedName = name.trim()
  const trimmedTagline = tagline.trim()

  return (
    <div
      data-testid="campaign-preview"
      style={accentStyle({ accent_color: accent })}
      className="flex items-center gap-4 mb-5 p-4 bg-bg-mid border border-border-base border-l-4 border-l-accent"
    >
      {showLogo ? (
        <img src={logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(logoUrl)} className="w-12 h-12 object-cover rounded shrink-0" />
      ) : (
        <BrandMark size={44} className="shrink-0" />
      )}
      <div className="min-w-0 flex flex-col gap-1.5">
        <span className="block font-exo text-[10px] tracking-[0.25em] uppercase text-txt-muted truncate">
          {trimmedTagline || PREVIEW_TAGLINE_PLACEHOLDER}
        </span>
        <span className="block font-exo text-xl font-bold tracking-[0.06em] uppercase text-accent-bright break-words">
          {trimmedName || PREVIEW_NAME_PLACEHOLDER}
        </span>
      </div>
    </div>
  )
}
