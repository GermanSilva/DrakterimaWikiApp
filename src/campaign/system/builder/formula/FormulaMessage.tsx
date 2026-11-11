import type { FormulaMessage as Message } from './useFormulaAnalysis'

const titleCls = 'block font-exo text-[11px] font-semibold tracking-[0.1em] uppercase mb-0.5'

/** The verdict on the formula: valid (role status) or why it cannot be calculated (role alert), with the "¿Quisiste decir…?" fix. */
export function FormulaMessage({ id, message, onFix }: { id: string; message: Message; onFix: (from: string, to: string) => void }) {
  if (message.kind === 'ok') {
    const refs = message.uses === 0 ? 'No usa ninguna referencia.' : message.uses === 1 ? 'Usa 1 referencia.' : `Usa ${message.uses} referencias.`
    const users = message.users.length === 0 ? 'Ningún otro campo depende de este.' : `Lo usan: ${message.users.map((u) => u.label).join(', ')}.`
    return (
      <div id={id} role="status" className="mx-3.5 mb-3 border-l-[3px] border-[color:var(--brand-3)] bg-[rgba(74,174,216,0.07)] px-3 py-2.5 text-[13px] leading-relaxed text-txt-secondary">
        <strong className={`${titleCls} text-txt-primary`}>Fórmula válida</strong>
        {refs} {users}
      </div>
    )
  }
  return (
    <div id={id} role="alert" className="mx-3.5 mb-3 border-l-[3px] border-accent-bright bg-accent-subtle/40 px-3 py-2.5 text-[13px] leading-relaxed text-txt-primary">
      <strong className={`${titleCls} text-accent-bright`}>{message.title}</strong>
      {message.text}
      {message.fix && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="font-mono text-[12px] px-2 py-0.5 border border-border-light bg-bg-mid text-txt-primary cursor-pointer hover:border-accent-dim focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-dim"
            onClick={() => message.fix && onFix(message.fix.from, message.fix.to)}
          >
            {`¿Quisiste decir {${message.fix.to}}?`}
          </button>
        </div>
      )}
    </div>
  )
}
