import { useId, useMemo, useState } from 'react'
import { inputCls } from '../../../constants'
import { resolveSheet } from '../sheet/resolveSheet'
import SheetView from '../sheet/SheetView'
import { useBuilder } from './builderContext'
import { chosenCharacter, testCharacterList, withDefaults } from './formula/testCharacters'

const NO_UNREAD: Record<string, boolean> = {}
const seg = (on: boolean) => `px-3 py-1 text-[12px] border cursor-pointer ${on ? 'border-accent text-txt-primary bg-bg-mid' : 'border-border-base text-txt-muted'}`

/**
 * The right pane (S42 g): the draft drawn by the real sheet view, calculated with the shared test character. Read only: it resolves in
 * memory and passes no storage key, so it never writes, saves or stamps anything. With an invalid draft it draws the last valid one.
 */
export function BuilderPreview({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { validSheet, lastValidSheet, testCharacters, testCharacterId, selectTestCharacter } = useBuilder()
  const [asDm, setAsDm] = useState(true)
  const titleId = useId()
  const selectId = useId()
  const bodyId = useId()
  const sheet = validSheet ?? lastValidSheet
  const characters = useMemo(() => (sheet ? testCharacterList(sheet, testCharacters) : []), [sheet, testCharacters])
  const character = chosenCharacter(characters, testCharacterId)
  const resolved = useMemo(() => (sheet && character ? resolveSheet(sheet, withDefaults(sheet, character.data)) : null), [sheet, character])
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 border border-border-base bg-bg-card flex flex-col min-[1100px]:sticky min-[1100px]:top-16 min-[1100px]:self-start min-[1100px]:max-h-[calc(100vh-6rem)]"
    >
      <h2 id={titleId} className={collapsed ? 'm-0 min-[1100px]:flex-1' : 'm-0 border-b border-border-base'}>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          title={collapsed ? 'Expandir vista previa' : 'Colapsar vista previa'}
          onClick={onToggle}
          className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 font-exo text-[11px] font-semibold tracking-[0.2em] uppercase text-txt-muted hover:text-txt-primary ${
            collapsed ? 'min-[1100px]:h-full min-[1100px]:flex-col-reverse min-[1100px]:justify-end min-[1100px]:px-0 min-[1100px]:py-3.5' : ''
          }`}
        >
          <span className={collapsed ? 'min-[1100px]:[writing-mode:vertical-rl] min-[1100px]:rotate-180' : ''}>Vista previa</span>
          <span aria-hidden="true" className={`text-[16px] leading-none motion-safe:transition-transform ${collapsed ? 'rotate-90 min-[1100px]:rotate-180' : '-rotate-90 min-[1100px]:rotate-0'}`}>
            ›
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={collapsed} className={collapsed ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-base px-3.5 py-2.5">
        <div role="group" aria-label="Ver como" className="flex">
          <button type="button" aria-pressed={asDm} className={seg(asDm)} onClick={() => setAsDm(true)}>
            DM
          </button>
          <button type="button" aria-pressed={!asDm} className={seg(!asDm)} onClick={() => setAsDm(false)}>
            Jugador
          </button>
        </div>
        {characters.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] text-txt-secondary">
            <label htmlFor={selectId}>Personaje de prueba</label>
            <select id={selectId} value={character?.id ?? ''} onChange={(e) => selectTestCharacter(e.target.value)} className={`${inputCls} !w-auto`}>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="px-3.5 pt-2.5 pb-2 text-[12px] text-txt-secondary">Ficha con los cambios sin guardar, calculada con el personaje de prueba.</p>
      {sheet && sheet !== validSheet && <p className="px-3.5 pb-2 text-[12px] text-amber-400">Mostrando la última versión válida</p>}
      <div className="min-h-0 overflow-y-auto px-3.5 pt-3 pb-3.5">
        {resolved ? <SheetView resolved={resolved} unread={NO_UNREAD} showHidden={asDm} /> : <p className="pt-3 text-[13px] text-txt-muted">Todavía no hay una versión válida de la plantilla para mostrar.</p>}
      </div>
      {asDm && <p className="border-t border-border-base px-3.5 py-2 text-[12px] text-txt-muted">Los campos ocultos aparecen con borde punteado solo en la vista del DM.</p>}
      </div>
    </section>
  )
}
