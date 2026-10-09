import { useState } from 'react'
import { Link } from 'react-router'
import { btnDanger, btnPrimary, btnSecondary, inputCls } from '../../constants'
import { ModalShell } from '../calendar/ModalShell'
import { typeLabel } from './notesSearch'

export interface DialogNote {
  type: string
  text: string
  /** Resolved entity name. */
  name: string
  /** `Author · Character` line, '' when there is nothing to show. */
  byline: string
  href: string
}

const TAG = 'font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted bg-border-light px-1.5 py-0.5 rounded-sm'

/** Note detail: read, edit in place (stays open and keeps the draft when the save fails), delete, open the article. */
export function NoteDetailDialog({
  note,
  onSave,
  onDelete,
  onClose,
}: {
  note: DialogNote
  /** Resolves false when the write failed. */
  onSave: (text: string) => Promise<boolean>
  onDelete: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (draft === null || saving) return
    setSaving(true)
    try {
      if (await onSave(draft)) setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={note.name} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className={TAG}>{typeLabel(note.type)}</span>
        {note.byline && <span className="text-xs text-txt-muted">{note.byline}</span>}
      </div>
      {draft === null ? (
        <div className="text-[13px] text-txt-secondary leading-[1.65] whitespace-pre-wrap mb-5">{note.text}</div>
      ) : (
        <textarea
          aria-label="Texto de la nota"
          className={`${inputCls} min-h-[140px] mb-5`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <div className="flex flex-wrap gap-2.5 justify-end">
        {draft === null ? (
          <>
            <button type="button" className={btnDanger} onClick={onDelete}>
              Eliminar
            </button>
            <button type="button" className={btnSecondary} onClick={() => setDraft(note.text)}>
              Editar
            </button>
            <Link to={note.href} className={btnPrimary} onClick={onClose}>
              Ir al artículo
            </Link>
          </>
        ) : (
          <>
            <button type="button" className={btnSecondary} onClick={() => setDraft(null)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={saving || draft.trim() === ''}>
              Guardar nota
            </button>
          </>
        )}
      </div>
    </ModalShell>
  )
}

/** Delete confirmation. Cancel / Escape / backdrop go back; the focus lands on the close button, never on Eliminar. */
export function ConfirmDeleteDialog({
  note,
  onConfirm,
  onCancel,
}: {
  note: Pick<DialogNote, 'type' | 'name' | 'byline'>
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <ModalShell title="¿Eliminar esta nota?" onClose={onCancel}>
      <p className="text-[13px] text-txt-muted mb-5">
        {note.name}
        <span className="font-exo text-[10px] tracking-[0.15em] uppercase ml-2">{typeLabel(note.type)}</span>
        {note.byline && <span className="block text-xs mt-1">{note.byline}</span>}
      </p>
      <div className="flex gap-2.5 justify-end">
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className={btnDanger}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
        >
          Eliminar
        </button>
      </div>
    </ModalShell>
  )
}
