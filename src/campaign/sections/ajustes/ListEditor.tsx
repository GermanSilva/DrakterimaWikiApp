import { useId, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { btnDanger, btnSecondary } from '../../../constants'

export interface RemovalPolicy {
  /** Why this item cannot be removed right now (the remove button is disabled and the reason shown). */
  blocked?: string
  /** Extra consequence shown in the confirmation. */
  warning?: string
}

interface ListEditorProps<T extends { uid: number }> {
  /** Accessible name of the list (also the group label). */
  label: string
  items: readonly T[]
  onChange: (items: T[]) => void
  onAdd: () => void
  addLabel: string
  /** When set the add button is disabled and this explains why (e.g. the maximum was reached). */
  addDisabled?: string
  /** Name of an item for the buttons' accessible names ("Subir Norte"). */
  itemName: (item: T) => string
  /** The editable fields of one row. */
  renderFields: (item: T, update: (patch: Partial<T>) => void) => ReactNode
  removal: (item: T) => RemovalPolicy
  /** Confirmation sentence for removing an item. */
  confirmText: (item: T) => string
  /** Error of the list as a whole (count limits). */
  listError?: string
  disabled?: boolean
}

const iconBtn =
  'inline-flex items-center justify-center h-8 w-8 bg-transparent text-txt-secondary border border-border-light cursor-pointer hover:border-accent-dim hover:text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * Accessible add / edit / reorder / remove list. Reordering uses up/down buttons (no drag and drop); removal asks
 * for an inline confirmation and can be blocked per item with a visible reason. Pure UI: the parent owns the drafts.
 */
export function ListEditor<T extends { uid: number }>({
  label,
  items,
  onChange,
  onAdd,
  addLabel,
  addDisabled,
  itemName,
  renderFields,
  removal,
  confirmText,
  listError,
  disabled,
}: ListEditorProps<T>) {
  const [confirming, setConfirming] = useState<number | null>(null)
  const listId = useId()

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const update = (uid: number) => (patch: Partial<T>) => onChange(items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)))

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3 list-none p-0 m-0">
        {items.map((item, index) => {
          const name = itemName(item)
          const policy = removal(item)
          const reasonId = `${listId}-${item.uid}-reason`
          return (
            <li key={item.uid} aria-label={name} className="bg-bg-card border border-border-base px-4 py-3 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">{renderFields(item, update(item.uid))}</div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" className={iconBtn} aria-label={`Subir ${name}`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className={iconBtn} aria-label={`Bajar ${name}`} disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={`Quitar ${name}`}
                    aria-describedby={policy.blocked ? reasonId : undefined}
                    disabled={disabled || Boolean(policy.blocked)}
                    onClick={() => setConfirming(item.uid)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {policy.blocked && (
                <p id={reasonId} className="text-[12px] text-txt-muted">
                  {policy.blocked}
                </p>
              )}
              {confirming === item.uid && !policy.blocked && (
                <div role="group" aria-label={`Confirmar quitar ${name}`} className="border border-accent-dim px-3 py-2 flex flex-col gap-2">
                  <p className="text-[13px] text-txt-secondary">
                    {confirmText(item)}
                    {policy.warning ? ` ${policy.warning}` : ''}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => {
                        setConfirming(null)
                        onChange(items.filter((it) => it.uid !== item.uid))
                      }}
                    >
                      Quitar
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {listError && (
        <p role="alert" className="text-[13px] text-red-400">
          {listError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className={btnSecondary} onClick={onAdd} disabled={disabled || Boolean(addDisabled)}>
          <Plus size={13} aria-hidden="true" />
          {addLabel}
        </button>
        {addDisabled && <span className="text-[12px] text-txt-muted">{addDisabled}</span>}
      </div>
    </div>
  )
}
