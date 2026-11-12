import { useSearchParams } from 'react-router'

/** A link to Sistema › Economía: switches to the Sistema tab (drafts of the other tabs stay) and scrolls to the block. */
export function EconomyLink() {
  const [, setParams] = useSearchParams()
  return (
    <button
      type="button"
      className="bg-transparent border-0 p-0 text-txt-secondary underline cursor-pointer hover:text-txt-primary"
      onClick={() => {
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('tab', 'sistema')
            return next
          },
          { replace: true },
        )
        // the panel of the tab is shown on the next render
        setTimeout(() => document.getElementById('ajustes-economia')?.scrollIntoView?.({ block: 'start' }), 0)
      }}
    >
      Sistema › Economía
    </button>
  )
}
