// src/components/WikiLinkPicker.jsx
import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { COLLECTION_LETTER, COLLECTION_DISPLAY } from './wikiHelpers'
import { inputCls } from '../constants'

export default function WikiLinkPicker({ onInsert, onClose }) {
  const { db } = useApp()
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Flat list of all entities across all collections
  const allItems = Object.keys(COLLECTION_LETTER).flatMap(coll =>
    (db[coll] || []).map(entity => ({
      entity,
      collection: coll,
      name: entity.nombre ?? entity.titulo ?? '',
      letter: COLLECTION_LETTER[coll],
    }))
  )

  const q = query.trim().toLowerCase()
  const filtered = q
    ? allItems.filter(item => item.name.toLowerCase().includes(q)).slice(0, 50)
    : allItems

  // Group by collection preserving COLLECTION_LETTER order
  const grouped = Object.keys(COLLECTION_LETTER).reduce((acc, coll) => {
    const items = filtered.filter(i => i.collection === coll)
    if (items.length) acc[coll] = items
    return acc
  }, {})

  return (
    <div
      className="fixed inset-0 bg-black/[.75] z-[400] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[min(480px,92vw)] max-h-[72vh] bg-bg-card border border-border-light flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-5 pt-5 pb-3 border-b border-border-base shrink-0">
          <input
            ref={inputRef}
            className={inputCls}
            placeholder="Buscar artículo..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).map(([coll, items]) => (
            <div key={coll}>
              <div className="px-5 py-1.5 font-exo text-[9px] font-semibold tracking-[0.2em] uppercase text-txt-muted bg-bg-mid border-b border-border-base">
                {COLLECTION_DISPLAY[coll]}
              </div>
              {items.map(({ entity, name, letter }) => (
                <button
                  key={entity.id}
                  type="button"
                  className="w-full text-left px-5 py-2.5 font-barlow text-sm text-txt-primary hover:bg-bg-mid transition-colors border-b border-border-base last:border-b-0 flex items-center gap-2.5"
                  onClick={() => {
                    onInsert(`[[{${entity.id}${letter}}${name}]]`)
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
