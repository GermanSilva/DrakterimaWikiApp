import { parseBannerUrl } from '../branding'

/**
 * The campaign banner behind the top of the panel, faded into the page background at its bottom edge. It is an <img>,
 * never a CSS url(), and only a strict https URL is rendered; without one the panel keeps the plain background.
 */
export function BannerBackdrop({ branding }: { branding: Record<string, unknown> | null | undefined }) {
  const banner = parseBannerUrl(branding?.banner_url)
  if (!banner) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[380px] overflow-hidden">
      <img data-testid="panel-banner" src={banner} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      <div data-testid="panel-banner-fade" className="absolute inset-0 bg-gradient-to-b from-bg-deep/45 via-bg-deep/70 to-bg-deep" />
    </div>
  )
}
