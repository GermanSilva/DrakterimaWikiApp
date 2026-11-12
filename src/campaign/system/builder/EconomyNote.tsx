import { Link, useInRouterContext } from 'react-router'

const NOTE = 'Las monedas y las instancias se configuran en Sistema › Economía.'

/** Where a coin or economy table's editor used to be: economy is configured in Sistema (and Juegos), the builder only places the table. */
export function EconomyNote() {
  const inRouter = useInRouterContext()
  return (
    <p className="text-[12px] text-txt-muted">
      {inRouter ? (
        <Link to={{ search: '?tab=sistema' }} className="underline hover:text-txt-primary">
          {NOTE}
        </Link>
      ) : (
        NOTE
      )}
    </p>
  )
}
