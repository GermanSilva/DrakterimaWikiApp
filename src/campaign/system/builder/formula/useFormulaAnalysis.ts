/** Everything the formula workbench shows about one formula: scope, result for the test character, trace, message and dependencies (S42). */
import { useMemo } from 'react'
import { evaluateFormula, explainFormula, parseFormula, type FormulaTrace, type ParseResult } from '../../formula/formula'
import { nearestReference } from '../../formula/suggest'
import { formulaUsers, referenceScope, type FormulaContext, type FormulaUser, type ScopeEntry } from '../../sheet/formulaScope'
import { sheetFormulaContext } from '../../sheet/resolveSheet'
import { validateSheet, type Sheet } from '../../sheet/sheetModel'
import { useBuilder } from '../builderContext'
import { setAt, parsePath, type Path } from '../draft'
import { evaluationErrorEs, formulaErrorEs, sheetErrorEs } from '../messagesEs'
import { chosenCharacter, testCharacterList, withDefaults, type TestCharacter } from './testCharacters'

export type Outcome = { kind: 'none' } | { kind: 'no-rows' } | { kind: 'ok'; value: number | string } | { kind: 'error'; reason: string }

export type FormulaMessage =
  | { kind: 'ok'; uses: number; users: FormulaUser[] }
  | { kind: 'error'; title: string; text: string; fix?: { from: string; to: string } }

export interface Analysis {
  parsed: ParseResult | null
  scope: ScopeEntry[]
  /** Set when the references cannot be listed (no valid template to read them from). */
  scopeNote: string | null
  characters: TestCharacter[]
  selectedId: string
  select: (id: string) => void
  /** A reference's value for the test character, as text ("—" when it has none). */
  valueOf: (ref: string) => string
  outcome: Outcome
  trace: FormulaTrace | null
  unknown: ReadonlySet<string>
  message: FormulaMessage | null
  users: FormulaUser[]
}

const NO_REFERENCES_NOTE = 'No hay una plantilla válida para sugerir referencias. Corregí los demás errores de la plantilla.'
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const rounded = (value: number) => String(Math.round(value * 100) / 100)

/** A value as the workbench writes it in lists and traces. */
export function showValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? rounded(value) : '—'
  if (typeof value === 'string') return value === '' ? '—' : value
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.length === 1 ? '1 fila' : `${value.length} filas`
  return '—'
}

/** The graph node the validator names for a formula written at `context` (its cycle errors list these). */
const nodeKey = (context: FormulaContext): string => (context.kind === 'field' ? context.key : context.kind === 'stat' ? `${context.row}.modificador` : `col:${context.table}.${context.column}`)

/** Who reads what `context` computes. A Capacidades column is read once per row ({fuerza.pericia}), so every row counts. */
function usersOfContext(sheet: Sheet, context: FormulaContext): FormulaUser[] {
  if (context.kind === 'field') return formulaUsers(sheet, context.key)
  if (context.kind === 'stat') return formulaUsers(sheet, `${context.row}.modificador`)
  const names = [`${context.table}.${context.column}`]
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'table' && item.type === 'capacidades' && item.key === context.table) for (const row of item.rows) names.push(`${row.key}.${context.column}`)
      }
    }
  }
  const found = new Map<string, FormulaUser>()
  for (const name of names) for (const user of formulaUsers(sheet, name)) if (!found.has(user.path)) found.set(user.path, user)
  return [...found.values()]
}

interface Input {
  context: FormulaContext
  /** Path of the formula text inside the draft. */
  path: Path
  text: string
  /** An empty formula is allowed (an option without one). */
  optional: boolean
}

export function useFormulaAnalysis({ context, path, text, optional }: Input): Analysis {
  const { draft, validSheet, lastValidSheet, sheetErrors, testCharacters, testCharacterId, selectTestCharacter } = useBuilder()
  const contextKey = JSON.stringify(context)
  const pathKey = path.join('.')

  const parsed = useMemo(() => (text.trim() === '' && optional ? null : parseFormula(text)), [text, optional])

  // The sheet to read the scope and the values from: the draft when it validates; else the draft with this formula set aside (the
  // formula being typed is the usual reason it does not validate); else the last template that did.
  const basis = useMemo<Sheet | null>(() => {
    if (validSheet) return validSheet
    const neutral = validateSheet(setAt(draft, path, '1'))
    return neutral.ok ? neutral.sheet : lastValidSheet
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `path` is read through `pathKey`
  }, [validSheet, draft, pathKey, lastValidSheet])

  const scope = useMemo(() => (basis ? referenceScope(basis, context) : []), [basis, contextKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const characters = useMemo(() => (basis ? testCharacterList(basis, testCharacters) : [...testCharacters]), [basis, testCharacters])
  const character = chosenCharacter(characters, testCharacterId)

  const reader = useMemo(
    () => (basis && character ? sheetFormulaContext(basis, withDefaults(basis, character.data), context) : null),
    [basis, character, contextKey], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const { outcome, trace } = useMemo<{ outcome: Outcome; trace: FormulaTrace | null }>(() => {
    if (!parsed || !parsed.ok || !reader) return { outcome: { kind: 'none' }, trace: null }
    if (reader.noRows) return { outcome: { kind: 'no-rows' }, trace: null }
    const result = evaluateFormula(parsed.ast, reader.resolve)
    const steps = explainFormula(parsed.ast, reader.resolve)
    return { outcome: result.ok ? { kind: 'ok', value: result.value } : { kind: 'error', reason: evaluationErrorEs(result.error) }, trace: steps }
  }, [parsed, reader])

  const here = useMemo(() => sheetErrors.filter((e) => parsePath(e.path).join('.') === pathKey), [sheetErrors, pathKey])
  const unknown = useMemo(() => {
    const refs = new Set<string>()
    for (const e of here) {
      const match = /^unknown reference \{(.*)\}$/.exec(e.message)
      if (match) refs.add(match[1])
    }
    return refs
  }, [here])

  const users = useMemo(() => (basis ? usersOfContext(basis, context) : []), [basis, contextKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const message = useMemo<FormulaMessage | null>(() => {
    if (!parsed) return null
    if (!parsed.ok) return { kind: 'error', title: 'No se puede calcular', text: sentence(formulaErrorEs(parsed.error)) }
    const key = nodeKey(context)
    const cycle = sheetErrors.find((e) => e.cycle?.some((node) => node.key === key))?.cycle
    if (cycle) return { kind: 'error', title: 'Las fórmulas se llaman en círculo', text: cycle.map((n) => n.label).join(' → ') }
    const problem = here[0]
    if (problem) {
      const unknownRef = /^unknown reference \{(.*)\}$/.exec(problem.message)?.[1]
      const near = unknownRef === undefined ? null : nearestReference(unknownRef, scope.map((e) => e.ref))
      return { kind: 'error', title: 'No se puede calcular', text: problem.message === 'invalid formula' ? 'La fórmula tiene caracteres de control.' : sheetErrorEs(problem.message), ...(unknownRef !== undefined && near ? { fix: { from: unknownRef, to: near } } : {}) }
    }
    return { kind: 'ok', uses: parsed.refs.length, users }
  }, [parsed, sheetErrors, here, scope, users, contextKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const valueOf = (ref: string) => (reader ? showValue(reader.resolve(ref)) : '—')
  const scopeNote = !basis || (basis === lastValidSheet && basis !== validSheet && scope.length === 0) ? NO_REFERENCES_NOTE : null

  return { parsed, scope, scopeNote, characters, selectedId: character?.id ?? '', select: selectTestCharacter, valueOf, outcome, trace, unknown, message, users }
}
