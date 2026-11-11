/** The formula bench every builder formula uses (S42): highlighted editor with autocomplete, insert chips, result for a test character, message and help tabs. */
import { useId, useRef } from 'react'
import type { FormulaContext } from '../../sheet/formulaScope'
import type { Path } from '../draft'
import { DependenciesTab } from './DependenciesTab'
import { ExplainTree } from './ExplainTree'
import { FormulaEditor, type EditorHandle } from './FormulaEditor'
import { FormulaMessage } from './FormulaMessage'
import { FormulaResult, type Expects } from './FormulaResult'
import { FunctionsTab } from './FunctionsTab'
import { HelpTabs } from './HelpTabs'
import { InsertChips } from './InsertChips'
import { useFormulaAnalysis } from './useFormulaAnalysis'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  /** Where the formula is written: decides which references are valid and which values are local. */
  context: FormulaContext
  /** Where the formula text lives in the draft (to read its errors). */
  path: Path
  /** An empty formula is fine (an option without one). */
  optional?: boolean
  /** What the owner of the formula holds, to say how the result is shown. */
  expects?: Expects
  format?: 'signed'
}

export function FormulaWorkbench({ label, value, onChange, context, path, optional = false, expects = 'number', format }: Props) {
  const id = useId()
  const editor = useRef<EditorHandle>(null)
  const analysis = useFormulaAnalysis({ context, path, text: value, optional })
  const { parsed, message } = analysis
  const failed = parsed !== null && !parsed.ok
  const errorSpan = parsed && !parsed.ok && value.trim() !== '' ? parsed.at : null
  const uses = parsed?.ok ? parsed.refs : []

  return (
    <div className="min-w-0 border border-border-light bg-bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-base px-3.5 py-2.5">
        <label htmlFor={id} className={labelCls}>
          {label}
        </label>
        <p className="text-[12px] text-txt-secondary">Escribí «{'{'}» para ver las referencias que podés usar acá.</p>
      </div>
      <div className="mx-3.5 mt-3.5">
        <FormulaEditor
          ref={editor}
          id={id}
          value={value}
          onChange={onChange}
          entries={analysis.scope}
          valueOf={analysis.valueOf}
          rowIsStat={context.kind === 'stat'}
          unknown={analysis.unknown}
          error={errorSpan}
          invalid={failed || message?.kind === 'error'}
          describedBy={message ? `${id}-message` : undefined}
        />
      </div>
      <InsertChips editor={editor} />
      {analysis.scopeNote && <p className="mx-3.5 mb-2 text-[12px] text-txt-secondary">{analysis.scopeNote}</p>}
      <FormulaResult
        outcome={analysis.outcome}
        broken={failed || message?.kind === 'error'}
        expects={expects}
        format={format}
        characters={analysis.characters}
        selectedId={analysis.selectedId}
        onSelect={analysis.select}
      />
      {message && <FormulaMessage id={`${id}-message`} message={message} onFix={(from, to) => onChange(value.split(`{${from}}`).join(`{${to}}`))} />}
      <HelpTabs
        panels={{
          explicar: <ExplainTree trace={analysis.trace} />,
          funciones: <FunctionsTab />,
          dependencias: <DependenciesTab uses={uses} valueOf={analysis.valueOf} users={analysis.users} />,
        }}
      />
    </div>
  )
}
