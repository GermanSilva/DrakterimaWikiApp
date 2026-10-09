/** Non-blocking note: stored entries the editor cannot read are kept as they are when the list is saved. */
export function UnreadableNotice({ count }: { count: number }) {
  return (
    <p role="status" className="text-[12px] text-txt-muted border border-border-base px-3 py-2">
      {count === 1
        ? 'Hay 1 entrada guardada que no se puede leer aquí. Se conserva sin cambios al guardar.'
        : `Hay ${count} entradas guardadas que no se pueden leer aquí. Se conservan sin cambios al guardar.`}
    </p>
  )
}
