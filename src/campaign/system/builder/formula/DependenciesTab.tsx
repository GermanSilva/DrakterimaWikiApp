import type { FormulaUser } from '../../sheet/formulaScope'

interface Props {
  /** The references the formula reads. */
  uses: readonly string[]
  valueOf: (ref: string) => string
  users: readonly FormulaUser[]
}

const rowCls = 'flex gap-2 border-b border-border-base py-1.5 text-[13px]'
const headCls = 'font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted'

/** "Dependencias" (S42 f): what the formula uses (with its value for the test character) and what uses it. */
export function DependenciesTab({ uses, valueOf, users }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-2">
      <div>
        <p className={headCls}>Usa</p>
        {uses.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-txt-secondary">Ninguna referencia.</p>
        ) : (
          <ul aria-label="Usa" className="mt-1.5 list-none">
            {uses.map((ref) => (
              <li key={ref} className={rowCls}>
                <code className="font-mono text-[12px] text-[color:var(--brand-3)]">{`{${ref}}`}</code>
                <span className="ml-auto font-mono text-[12px] text-txt-primary">{valueOf(ref)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className={headCls}>Lo usan</p>
        {users.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-txt-secondary">Nadie todavía.</p>
        ) : (
          <ul aria-label="Lo usan" className="mt-1.5 list-none">
            {users.map((user) => (
              <li key={user.path} className={rowCls}>
                {user.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
