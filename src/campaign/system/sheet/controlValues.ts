/** Value helpers and the locked style shared by the typed controls (Control.tsx) and the editors that draw them. */
export const toNumber = (text: string): number | null => (text.trim() === '' ? null : Number(text))
export const numberText = (value: unknown): string => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '')
export const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A value the viewer cannot type: a locked copy of the control. */
export const LOCKED = 'opacity-70 cursor-default'
