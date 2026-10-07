// src/components/WikiLinkPicker.jsx
import { useState, useRef, useEffect } from 'react'
import { useWikiPort } from '../ports'
import { COLLECTION_LETTER, COLLECTION_DISPLAY } from './wikiHelpers'
import { inputCls } from '../constants'
import useBackdropClose from '../hooks/useBackdropClose'

export default function WikiLinkPicker({ onInsert, onClose }) {
  const backdropProps = useBackdropClose(onClose)
  const { search } = useWikiPort()
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = search(query)

  // Group by collection preserving COLLECTION_LETTER order
  const grouped = Object.keys(COLLECTION_LETTER).reduce((acc, coll) => {
    const items = filtered.filter(i => i.table === coll)
    if (items.length) acc[coll] = items
    return acc
  }, {})

  return (
    <div
      className="fixed inset-0 bg-black/[.75] z-[1001] flex items-center justify-center"
      {...backdropProps}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Insertar enlace a un artículo"
        className="w-[min(480px,92vw)] max-h-[72vh] bg-bg-card border border-border-light flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-5 pt-5 pb-3 border-b border-border-base shrink-0 flex items-center gap-3">
          <input
            ref={inputRef}
            className={inputCls}
            placeholder="Buscar artículo..."
            aria-label="Buscar artículo"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="text-txt-muted hover:text-txt-primary text-xl leading-none shrink-0 border-none bg-transparent cursor-pointer"
            onClick={onClose}
            aria-label="Cerrar"
          >×</button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).map(([coll, items]) => (
            <div key={coll}>
              <div className="px-5 py-1.5 font-exo text-[9px] font-semibold tracking-[0.2em] uppercase text-txt-muted bg-bg-mid border-b border-border-base">
                {COLLECTION_DISPLAY[coll]}
              </div>
              {items.map(({ id, title: name, letter }) => (
                <button
                  key={id}
                  type="button"
                  className="w-full text-left px-5 py-2.5 font-barlow text-sm text-txt-primary hover:bg-bg-mid transition-colors border-b border-border-base last:border-b-0 flex items-center gap-2.5"
                  onClick={() => {
                    onInsert(`[[{${id}${letter}}${name}]]`)
                    onClose()
                  }}
                >
                  <span className="font-exo text-[10px] font-semibold text-txt-muted bg-bg-mid px-1.5 py-0.5 shrink-0">
                    {letter}
                  </span>
                  {name}
                </button>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="px-5 py-10 text-center font-barlow text-sm text-txt-muted">
              Sin resultados
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
