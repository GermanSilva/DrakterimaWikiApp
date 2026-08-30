export const sectionTitleCls = 'font-exo text-[15px] font-semibold tracking-[0.25em] text-accent-dim uppercase mb-2'
export const detailTextCls = 'text-sm leading-[1.45] text-txt-secondary'
export const detailSectionCls = 'mt-5 pt-4 border-t border-border-base'

export const dmSectionCls = 'mt-5 pt-4 border-t-2 border-t-accent'
export const dmTitleCls = 'font-exo text-[13px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2'

export const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5 flex gap-2'
export const inputCls = 'w-full bg-bg-mid border border-border-base text-txt-primary font-barlow text-sm px-3 py-2 outline-none transition-colors focus:border-accent-dim'

export const btnPrimary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none'
export const btnDanger = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-accent border border-accent-dim hover:bg-accent/[.15]'
export const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'
export const btnFilled = '!bg-[#060606]'

export const REGION_COLOR = {
  magral: '#7aad82',
  nezor: '#c4834a',
  heladas: '#7aaad0',
  islas: '#9090c0',
}

// Marcadores de disponibilidad por PJ en el Calendario — clave = pj_id (slot fijo 1-6, ver PLAYER_PASSWORDS en App.jsx).
export const PLAYER_MARKERS = {
  1: { label: 'MA', color: '#a855f7' }, // Maisie — violeta
  2: { label: 'EL', color: '#22c55e' }, // Eldric — verde
  3: { label: 'KX', color: '#4f46e5' }, // Kaylinx — índigo
  4: { label: 'AL', color: '#e52b50' }, // Alyssara — amaranto
  5: { label: 'KN', color: '#7a2436' }, // Kaelen — granate
  6: { label: 'ÖL', color: '#f97316' }, // Öloon — naranja
}