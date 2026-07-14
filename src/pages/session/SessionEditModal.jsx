import { useEffect, useState } from 'react'
import { useApp } from '../../AppContext'
import { labelCls, inputCls, btnPrimary, btnSecondary } from '../../constants'
import { ABILITY_SCORES } from '../pj/pjConstants'
import { abilityMod } from '../../helpers/pjCalc'
import AttacksCRUD from '../pj/form/AttacksCRUD'
import EquipmentCRUD from '../pj/form/EquipmentCRUD'
import SpellsCRUD from '../pj/form/SpellsCRUD'
import { CARD_REGISTRY } from './cards/cardRegistry'

// Scoped edit modal for a single card type on a single PJ.
//
// GOTCHA (see design doc): `save('pjs', data)` does a non-merge `setDoc` —
// it overwrites the entire PJ document. `draft` MUST therefore always be a
// full `{ ...pj }` copy (mirrors `PJForm`'s `f` state), even though this
// modal only exposes inputs for one card's fields. Never build `draft` from
// a partial field subset.
export default function SessionEditModal({ pj, cardType, onClose }) {
  const { save } = useApp()
  const [draft, setDraft] = useState({ ...pj })

  // Re-seed the full draft whenever a different PJ/card is opened.
  useEffect(() => {
    setDraft({ ...pj })
  }, [pj])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleConfirm() {
    const data = {
      ...draft,
      stat_str: parseInt(draft.stat_str) || 0,
      stat_dex: parseInt(draft.stat_dex) || 0,
      stat_con: parseInt(draft.stat_con) || 0,
      stat_int: parseInt(draft.stat_int) || 0,
      stat_wis: parseInt(draft.stat_wis) || 0,
      stat_cha: parseInt(draft.stat_cha) || 0,
      stat_hp: parseInt(draft.stat_hp) || 0,
      stat_ac: parseInt(draft.stat_ac) || 0,
    }
    save('pjs', data)
    onClose()
  }

  const cardLabel = CARD_REGISTRY[cardType]?.label ?? ''

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-base max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-base flex items-start justify-between gap-4 sticky top-0 z-[1] bg-bg-card">
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em]">{draft.nombre}</div>
            <div className="font-exo text-[16px] font-bold text-txt-primary uppercase">{cardLabel}</div>
          </div>
          <button
            type="button"
            className="text-txt-muted hover:text-txt-primary text-xl leading-none shrink-0 border-none bg-transparent cursor-pointer mt-0.5"
            onClick={onClose}
          >×</button>
        </div>

        <div className="px-6 py-5">
          {cardType === 'weapons' && (
            <AttacksCRUD
              ataques={draft.ataques ?? []}
              onChange={ataques => setDraft(p => ({ ...p, ataques }))}
            />
          )}

          {cardType === 'inventory' && (
            <EquipmentCRUD
              equipo={draft.equipo ?? []}
              monedas={draft.monedas ?? {}}
              monedas_guardado={draft.monedas_guardado ?? {}}
              onEquipoChange={equipo => setDraft(p => ({ ...p, equipo }))}
              onMonedasChange={monedas => setDraft(p => ({ ...p, monedas }))}
              onMonedasGuardadoChange={monedas_guardado => setDraft(p => ({ ...p, monedas_guardado }))}
            />
          )}

          {cardType === 'spells' && (
            <SpellsCRUD
              hechizos={draft.hechizos ?? []}
              onChange={hechizos => setDraft(p => ({ ...p, hechizos }))}
            />
          )}

          {cardType === 'stats' && (
            <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3">
              {ABILITY_SCORES.map(({ label, key }) => (
                <div key={key} className="text-center">
                  <label className={`${labelCls} flex justify-between items-baseline`}>
                    <span>{label}</span>
                    <span className="text-txt-primary font-bold">{abilityMod(parseInt(draft[key]) || 10)}</span>
                  </label>
                  <input
                    className={`${inputCls} text-center`}
                    type="number"
                    value={draft[key]}
                    onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
                    min="1" max="30"
                  />
                </div>
              ))}
            </div>
          )}

          {cardType === 'hp-ac' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>HP Máx.</label>
                <input
                  className={inputCls}
                  type="number"
                  value={draft.stat_hp}
                  onChange={e => setDraft(p => ({ ...p, stat_hp: e.target.value }))}
                  min="0"
                />
              </div>
              <div>
                <label className={labelCls}>AC</label>
                <input
                  className={inputCls}
                  type="number"
                  value={draft.stat_ac}
                  onChange={e => setDraft(p => ({ ...p, stat_ac: e.target.value }))}
                  min="0"
                />
              </div>
            </div>
          )}

          {cardType === 'inspiration' && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!draft.stat_inspiration}
                onChange={e => setDraft(p => ({ ...p, stat_inspiration: e.target.checked }))}
              />
              <span className={labelCls} style={{ marginBottom: 0 }}>Inspiración</span>
            </label>
          )}
        </div>

        <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-6 py-4 border-t border-border-base">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btnPrimary} onClick={handleConfirm}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
