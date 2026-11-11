import type { FormulaTrace } from '../../formula/formula'
import { evaluationErrorEs } from '../messagesEs'
import { showValue } from './useFormulaAnalysis'

/** A literal (a number or a text in quotes) explains nothing: it is not a step. */
const isLiteral = (step: FormulaTrace) => step.children.length === 0 && /^(-?\d+(\.\d+)?|".*")$/.test(step.text)

function Step({ step }: { step: FormulaTrace }) {
  const kids = step.children.filter((child) => !isLiteral(child))
  return (
    <li role="treeitem" aria-expanded={kids.length > 0 ? true : undefined}>
      <code className="text-txt-primary">{step.text}</code> <span className="text-txt-secondary">=</span>{' '}
      {step.ok ? (
        <span className="text-[color:var(--brand-3)]">{typeof step.value === 'string' ? `"${step.value}"` : showValue(step.value)}</span>
      ) : (
        <span className="text-accent-bright">{evaluationErrorEs(step.error)}</span>
      )}
      {kids.length > 0 && (
        <ul role="group" className="ml-1.5 mt-0.5 list-none border-l border-dashed border-border-light pl-4">
          {kids.map((child, i) => (
            <Step key={i} step={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** "Explicar el resultado" (S42 f): the evaluation as a nested list, each step with what it gave for the test character. */
export function ExplainTree({ trace }: { trace: FormulaTrace | null }) {
  if (!trace) return <p className="text-[13px] text-txt-secondary">Corregí la fórmula para ver el paso a paso.</p>
  return (
    <ul role="tree" aria-label="Paso a paso" className="list-none font-mono text-[13px] leading-[1.7]">
      <Step step={trace} />
    </ul>
  )
}
