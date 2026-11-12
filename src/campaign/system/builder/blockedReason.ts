/** Why the template cannot be saved while it has `errors` errors (the bar of the tab reads it with its disabled Save button). */
export const blockedReason = (errors: number) =>
  errors === 1 ? 'Corregí el error de la plantilla para poder guardar.' : `Corregí los ${errors} errores de la plantilla para poder guardar.`
