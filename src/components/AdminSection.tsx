import type { ReactNode } from 'react'

/**
 * Building blocks shared by the DM admin screens (the legacy Zona DM and the hub's Ajustes page):
 * a titled block and a "label + description + button" row.
 */
export function AdminSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase font-semibold mb-3 pb-2 border-b border-border-base">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

export function AdminAction({
  label,
  description,
  buttonLabel,
  disabled,
  onClick,
}: {
  label: string
  description?: string
  buttonLabel: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <div className="bg-bg-card border border-border-base px-5 py-4 flex items-center justify-between gap-6">
      <div>
        <div className="font-exo text-[12px] font-semibold text-txt-primary tracking-[0.04em] uppercase mb-0.5">{label}</div>
        {description && <div className="text-[12px] text-txt-secondary">{description}</div>}
      </div>
      <button
        type="button"
        className="flex-shrink-0 inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-muted border border-border-light hover:border-accent-dim hover:text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onClick}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
