import type { ReactNode } from 'react'
import { btnDanger, btnSecondary } from '../../../constants'
import { ModalShell } from '../../calendar/ModalShell'

export interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  /** Label while the action runs. */
  busyLabel: string
  busy: boolean
  /** The reason the last attempt failed; the dialog stays open so the DM reads it. */
  error: string | null
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** A modal that asks before a consequential change: Cancel is the safe default, Escape and the backdrop cancel. */
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy, error, confirmDisabled = false, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <ModalShell title={title} onClose={busy ? () => undefined : onClose}>
      <div className="text-sm text-txt-secondary flex flex-col gap-3 mb-5">{children}</div>
      {error && (
        <p role="alert" className="text-[13px] text-red-400 mb-4">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className={btnDanger} onClick={onConfirm} disabled={busy || confirmDisabled} aria-busy={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}
