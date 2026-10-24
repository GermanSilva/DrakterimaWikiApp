import type { ReactNode } from 'react'

/**
 * Footer for the action buttons of a modal or form. Actions sit on the right, the cancelling one first and the
 * confirming one last; `align="center"` is for the single final button of a modal or form.
 */
export function DialogActions({ children, align = 'end', className = '' }: { children: ReactNode; align?: 'end' | 'center'; className?: string }) {
  const justify = align === 'center' ? 'justify-center' : 'justify-end'
  return <div className={`flex flex-wrap items-center ${justify} gap-2.5 mt-5 ${className}`.trim()}>{children}</div>
}
