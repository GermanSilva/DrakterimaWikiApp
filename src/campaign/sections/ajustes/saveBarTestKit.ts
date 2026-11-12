import { fireEvent, screen, within } from '@testing-library/react'

/** The sticky save bar of the active Ajustes tab (it only exists for the accessibility tree while it has something to say). */
export const saveBar = () => screen.findByRole('region', { name: 'Guardar cambios' })

/** Presses a button of the bar: the tab's primary save ("Guardar campaña", "Guardar sistema"...) or "Descartar". */
export const pressBar = async (name: string | RegExp) => fireEvent.click(within(await saveBar()).getByRole('button', { name }))
