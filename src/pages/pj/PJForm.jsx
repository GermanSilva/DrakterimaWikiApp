import { useState } from 'react'
import { Link } from 'lucide-react'
import { useFormActions, useFormPort } from '../../ports'
import PJIdentityTab from './form/PJIdentityTab'
import PJMechanicsTab from './form/PJMechanicsTab'
import PJInventoryTab from './form/PJInventoryTab'
import { buildPjFormState, toPjPayload } from './pjFormState'
import { btnPrimary, btnSecondary, btnDanger } from '../../constants'

/**
 * Character form (3 tabs). It reads everything it needs from the form ports, so the legacy app and the
 * hub host share it. A player who owns the character (`ownCharacterIds`) gets only the identity tab,
 * without level / XP / DM fields; the hub host additionally narrows what is saved to what the database
 * lets an owner edit.
 */
export default function PJForm({ item, openPicker }) {
  const { save, remove, closeForm, saving } = useFormActions()
  const { isDM, regions, ownCharacterIds = [], characterFields = [], playerAccess = false } = useFormPort()
  const isOwnPlayer = !isDM && item != null && ownCharacterIds.includes(item.id)

  const TABS = [
    { id: 'identidad', label: 'Identidad' },
    ...(!isOwnPlayer ? [
      { id: 'mecanicas', label: 'Mecánicas' },
      { id: 'inventario', label: 'Equipo & Rasgos' },
    ] : []),
  ]
  const [tab, setTab] = useState('identidad')

  const [f, setF] = useState(() => buildPjFormState(item, { regions, characterFields }))


  function handleSave() {
    const data = toPjPayload(f, item?.id)
    if (playerAccess) {
      // the legacy document keeps its (never edited here) access fields
      data.player_password = item?.player_password ?? ''
      data.player_must_change = item?.player_must_change ?? false
    }
    save('pjs', data)
  }

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-0 border-b border-border-base">
        <div className="mb-0 pb-4 flex items-center justify-between">
          <span>{item ? `Editar PJ — ${item.nombre}` : 'Nuevo Personaje Jugador'}</span>
          {openPicker && (
            <button
              type="button"
              className={`${btnSecondary} flex items-center gap-1.5`}
              onMouseDown={e => e.preventDefault()}
              onClick={openPicker}
            >
              <Link size={13} />
              Insertar enlace
            </button>
          )}
        </div>
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-5 py-2.5 border-none cursor-pointer transition-colors ${tab === t.id ? 'text-txt-primary border-b-2 border-b-accent bg-transparent' : 'text-txt-muted bg-transparent hover:text-txt-secondary border-b-2 border-b-transparent'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-5">
        {tab === 'identidad' && (
          <PJIdentityTab f={f} setF={setF} isDM={isDM} isOwnPlayer={isOwnPlayer} />
        )}
        {tab === 'mecanicas' && <PJMechanicsTab f={f} setF={setF} />}
        {tab === 'inventario' && <PJInventoryTab f={f} setF={setF} />}
      </div>

      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && !isOwnPlayer && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
