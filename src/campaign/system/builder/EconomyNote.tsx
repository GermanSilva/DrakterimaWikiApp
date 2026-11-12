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

/** Discarded economy instances are not reviewed in the builder: they are in Sistema › Economía. */
export function EconomyDiscardedNote({ count }: { count: number }) {
  const inRouter = useInRouterContext()
  const text = count === 1 ? '1 instancia de economía descartada: se revisa, restaura o elimina en Sistema › Economía.' : `${count} instancias de economía descartadas: se revisan, restauran o eliminan en Sistema › Economía.`
  return (
    <p role="status" aria-label="Instancias de economía descartadas" className="text-[12px] text-txt-muted">
      {inRouter ? (
        <Link to={{ search: '?tab=sistema' }} className="underline hover:text-txt-primary">
          {text}
        </Link>
      ) : (
        text
      )}
    </p>
  )
}
