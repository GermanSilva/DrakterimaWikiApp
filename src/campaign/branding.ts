import type { CSSProperties } from 'react'
import type { Campaign } from '../data'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** A strict #rrggbb colour, or null. Anything else (named colours, url(), var(), 3-digit) is ignored. */
export function parseAccentColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : null
}

/** An absolute https URL, or null. http:, data:, javascript: and relative values are rejected. */
export function parseLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

type Rgb = [number, number, number]

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

function mix(rgb: Rgb, target: number, amount: number): Rgb {
  return rgb.map((c) => Math.round(c + (target - c) * amount)) as Rgb
}

const triplet = (rgb: Rgb) => rgb.join(' ')

/**
 * CSS variables for a campaign accent. Every value is rebuilt from parsed integers, never copied
 * from the stored string, so the stored value cannot inject CSS. Tailwind's accent colours read
 * the *-rgb triplets (see tailwind.config.js); `--accent` carries the plain hex.
 */
export function accentStyle(branding: Campaign['branding']): CSSProperties | undefined {
  const hex = parseAccentColor(branding?.accent_color)
  if (!hex) return undefined
  const base = toRgb(hex)
  return {
    '--accent': hex,
    '--accent-rgb': triplet(base),
    '--accent-bright-rgb': triplet(mix(base, 255, 0.2)),
    '--accent-dim-rgb': triplet(mix(base, 0, 0.35)),
    '--accent-subtle-rgb': triplet(mix(base, 0, 0.75)),
  } as CSSProperties
}
