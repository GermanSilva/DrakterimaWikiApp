import { useId } from 'react'

export interface BrandMarkProps {
  size?: number
  className?: string
  /** Accessible name. Without it the mark is decorative and hidden from assistive technology. */
  title?: string
}

/** The RPG Quester mark: a "Q" drawn as a d20, stroked with the brand gradient (same shapes as public/favicon.svg). */
export function BrandMark({ size = 32, className, title }: BrandMarkProps) {
  const gradientId = useId()
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="6" y1="4" x2="58" y2="60">
          <stop offset="0" stopColor="#9c2d8c" />
          <stop offset="0.5" stopColor="#4a32ac" />
          <stop offset="1" stopColor="#4aaed8" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gradientId})`} strokeLinejoin="round" strokeLinecap="round">
        <polygon points="32,4 56.2,18 56.2,46 32,60 7.8,46 7.8,18" strokeWidth="4.5" />
        <polygon points="32,15 46.5,40 17.5,40" strokeWidth="3" />
        <path d="M32 15V4M46.5 40l9.7 6M17.5 40l-9.7 6" strokeWidth="3" />
        <path d="M39 42l17 17" strokeWidth="6" />
      </g>
    </svg>
  )
}
