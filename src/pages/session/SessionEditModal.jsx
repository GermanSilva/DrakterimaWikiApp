import { useEffect, useId, useRef, useState } from 'react'
import useDialogFocus from '../../hooks/useDialogFocus'
import useBackdropClose from '../../hooks/useBackdropClose'
import { useSessionScreenPort } from '../../ports'
import { buildSessionPjPatch } from '../../helpers/pjWrites'
import { labelCls, inputCls, btnPrimary, btnSecondary, detailSectionCls } from '../../constants'
import { ABILITY_SCORES } from '../pj/pjConstants'
import { abilityMod } from '../../helpers/pjCalc'
import AttacksCRUD from '../pj/form/AttacksCRUD'
import EquipmentCRUD from '../pj/form/EquipmentCRUD'
import ResourcesCRUD from '../pj/form/ResourcesCRUD'
import SpellsCRUD from '../pj/form/SpellsCRUD'
import SkillsProficiencyGrid from '../pj/form/SkillsProficiencyGrid'
import { CARD_REGISTRY } from './cards/cardRegistry'

// Scoped edit modal for a single card type on a single PJ.
//
// `draft` is always a full `{ ...pj }` copy (mirrors `PJForm`'s `f` state), even
// though this modal only exposes inputs for one card's fields. What is SAVED is
// not the draft: `buildSessionPjPatch` diffs it against the character as it was
// opened and the host writes only the fields that changed, so a stale draft can
// never overwrite what someone else changed in the other cards' fields.
export default function SessionEditModal({ pj, cardType, onClose }) {
  const port = useSessionScreenPort()
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef(null)
  const titleId = useId()
  useDialogFocus(dialogRef)
  const backdropProps = useBackdropClose(onClose)
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

  async function handleConfirm() {
    if (saving) return
    const patch = buildSessionPjPatch(pj, draft)
    if (Object.keys(patch).length === 0) {
      onClose() // nothing changed: nothing to write
      return
    }
    setSaving(true)
    let saved = false
    try {
      saved = await port.savePj(pj, patch)
    } finally {
      setSaving(false)
    }
    if (saved) onClose() // else the host's toast says why and the edits stay in the modal
  }

  const cardLabel = CARD_REGISTRY[cardType]?.label ?? ''

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-bg-card border border-border-base max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto outline-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-base flex items-start justify-between gap-4 sticky top-0 z-[1] bg-bg-card">
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em]">{draft.nombre}</div>
            <div id={titleId} className="font-exo text-[16px] font-bold text-txt-primary uppercase">{cardLabel}</div>
          </div>
          <button
            type="button"
            className="text-txt-muted hover:text-txt-primary text-xl leading-none shrink-0 border-none bg-transparent cursor-pointer mt-0.5"
            onClick={onClose}
            aria-label="Cerrar"
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

          {cardType === 'resources' && (
            <ResourcesCRUD
              recursos={draft.recursos ?? []}
              onChange={recursos => setDraft(p => ({ ...p, recursos }))}
            />
          )}

          {cardType === 'spells' && (
            <>
              {Object.entries(draft.spell_slots ?? {}).filter(([, max]) => max > 0).length > 0 && (
                <div className={detailSectionCls}>
                  <div className={labelCls} style={{ marginBottom: '10px' }}>Espacios de Conjuro</div>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(draft.spell_slots ?? {}).filter(([, max]) => max > 0).map(([lvl, max]) => (
                      <div key={lvl} className="text-center">
                        <div className="font-exo text-[10px] text-txt-muted mb-1">Niv {lvl}</div>
                        <div className="flex items-center gap-1">
                          <input
                            className={`${inputCls} text-center px-1 w-14`}
                            type="number" min="0"
                            value={draft.spell_slots_current?.[lvl] ?? max}
                            onChange={e => setDraft(p => ({ ...p, spell_slots_current: { ...p.spell_slots_current, [lvl]: parseInt(e.target.value) || 0 } }))}
                          />
                          <span className="text-txt-muted">/</span>
                          <input
                            className={`${inputCls} text-center px-1 w-14`}
                            type="number" min="0"
                            value={max}
                            onChange={e => setDraft(p => ({ ...p, spell_slots: { ...p.spell_slots, [lvl]: parseInt(e.target.value) || 0 } }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <SpellsCRUD
                hechizos={draft.hechizos ?? []}
                onChange={hechizos => setDraft(p => ({ ...p, hechizos }))}
              />
            </>
          )}

          {cardType === 'skills' && (
            <SkillsProficiencyGrid f={draft} setF={setDraft} />
          )}

          {cardType === 'stats' && (
            <>
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

              <div className={detailSectionCls}>
                <div className={labelCls} style={{ marginBottom: '10px' }}>Otros valores</div>
                <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
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
                    <label className={labelCls}>HP Actual</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={draft.stat_hp_current ?? draft.stat_hp ?? ''}
                      onChange={e => setDraft(p => ({ ...p, stat_hp_current: e.target.value }))}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>HP Temporal</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={draft.stat_hp_temp ?? ''}
                      onChange={e => setDraft(p => ({ ...p, stat_hp_temp: e.target.value }))}
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
                  <div>
                    <label className={labelCls}>AC Temporal</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={draft.stat_ac_temp ?? ''}
                      onChange={e => setDraft(p => ({ ...p, stat_ac_temp: e.target.value }))}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Velocidad (ft)</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={draft.stat_speed}
                      onChange={e => setDraft(p => ({ ...p, stat_speed: e.target.value }))}
                      min="0"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Bono Proficiencia</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={draft.stat_proficiency_bonus}
                      onChange={e => setDraft(p => ({ ...p, stat_proficiency_bonus: e.target.value }))}
                      min="2" max="6"
                    />
                  </div>
                </div>
              </div>
            </>
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
          <button type="button" className={btnPrimary} onClick={handleConfirm} disabled={saving}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
