import { Link } from 'react-router'
import { MonitorPlay } from 'lucide-react'
import { BrandMark } from '../../components/BrandMark'
import { btnPrimary } from '../../constants'
import { parseBannerUrl, parseLogoUrl } from '../branding'

export interface PanelHeaderProps {
  name: string
  slug: string
  branding: Record<string, unknown> | null | undefined
  isDM: boolean
}

/**
 * "Vista general" block: the campaign icon at the left (as tall as the text beside it), the eyebrow, the title and the
 * campaign name, over an optional banner image. The banner is an <img>, never a CSS url(), so a stored value cannot
 * inject styles; only a strict https URL is rendered.
 */
export function PanelHeader({ name, slug, branding, isDM }: PanelHeaderProps) {
  const logo = parseLogoUrl(branding?.logo_url)
  const banner = parseBannerUrl(branding?.banner_url)
  return (
    <div className="relative overflow-hidden mb-7 border border-border-base bg-bg-card">
      {banner && (
        <>
          <img data-testid="panel-banner" src={banner} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-bg-deep/95 via-bg-deep/70 to-bg-deep/30" />
        </>
      )}
      <div className="relative flex items-stretch gap-5 p-5 max-sm:flex-wrap">
        <div data-testid="panel-icon" className="aspect-square self-stretch shrink-0 min-h-[72px]">
          {logo ? (
            <img src={logo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
          ) : (
            <BrandMark size={72} className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">Vista general</div>
          <h1 className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase leading-tight">Panel de campaña</h1>
          <p className="text-sm text-txt-secondary italic mt-1 truncate">{name}</p>
        </div>
        {isDM && (
          <Link to={`/c/${encodeURIComponent(slug)}/sesion-en-vivo`} className={`${btnPrimary} self-start inline-flex items-center gap-1.5 flex-shrink-0`}>
            <MonitorPlay size={14} aria-hidden="true" /> Pantalla de sesión
          </Link>
        )}
      </div>
    </div>
  )
}
