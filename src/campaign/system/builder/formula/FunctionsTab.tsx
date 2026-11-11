import { useId, useState } from 'react'
import { inputCls } from '../../../../constants'
import { FORMULA_FUNCTIONS, type FunctionGroup } from '../../formula/functionCatalogue'
import { plain } from './completion'

const GROUP_LABEL: Record<FunctionGroup, string> = { general: 'general', texto: 'texto', tabla: 'tabla' }

/** "Funciones" (S42 f): the catalogue with a search box; each function with its syntax, what it does and a worked example. */
export function FunctionsTab() {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const wanted = plain(query.trim())
  const shown = FORMULA_FUNCTIONS.filter((f) => wanted === '' || plain(`${f.name} ${f.syntax} ${f.description} ${GROUP_LABEL[f.group]}`).includes(wanted))
  return (
    <div>
      <label htmlFor={searchId} className="sr-only">
        Buscar función
      </label>
      <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar función: redondear, tabla, texto…" className={`${inputCls} mb-2.5`} />
      {shown.length === 0 ? (
        <p className="text-[13px] text-txt-secondary">Ninguna función coincide.</p>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-2 min-[720px]:grid-cols-2">
          {shown.map((f) => (
            <li key={f.name} className="border border-border-base bg-bg-mid p-2.5">
              <code className="font-mono text-[13px] text-[#d9a3d0]">{f.syntax}</code>
              <p className="my-1 text-[12px] text-txt-secondary">{f.description}</p>
              <p className="font-mono text-[12px] text-txt-primary">{f.example}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
