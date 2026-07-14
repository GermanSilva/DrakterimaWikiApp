import { useEffect, useState } from 'react'
import { useApp } from '../../AppContext'
import { btnPrimary, btnSecondary } from '../../constants'
import AttacksCRUD from '../pj/form/AttacksCRUD'
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
    save('pjs', draft)
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
        </div>

        <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-6 py-4 border-t border-border-base">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btnPrimary} onClick={handleConfirm}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
