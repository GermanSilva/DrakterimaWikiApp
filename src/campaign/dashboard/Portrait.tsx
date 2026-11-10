import { parseHttpsUrl } from '../branding'

/** Character image (https only) or, without one, the initial of the name. */
export function Portrait({ name, url, className = '', testId }: { name: string; url: unknown; className?: string; testId?: string }) {
  const src = parseHttpsUrl(url)
  return (
    <div data-testid={testId} aria-hidden="true" className={`grid place-items-center overflow-hidden border border-border-light bg-gradient-to-br from-border-light to-bg-card font-exo text-txt-muted ${className}`}>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" /> : (name.trim()[0] ?? '?').toLocaleUpperCase('es')}
    </div>
  )
}
