import { useState, useRef, useEffect } from 'react'
import { btnSecondary } from '../constants'
import { useApp } from '../AppContext'

export function useTabFetch(fetchFn) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nextUrl, setNextUrl] = useState(null)

  function run(params, append = false) {
    let ignored = false
    setLoading(true)
    setError(null)
    fetchFn(params)
      .then(({ results: r, next }) => {
        if (ignored) return
        setResults(prev => append ? [...prev, ...r] : r)
        setNextUrl(next ?? null)
      })
      .catch(e => { if (!ignored) setError(e.message) })
      .finally(() => { if (!ignored) setLoading(false) })
    return () => { ignored = true }
  }

  return { results, loading, error, nextUrl, run }
}

export function SRDDetailHeader({ name, subtitle, onBack }) {
  const backBarRef = useRef(null)
  const nameRef = useRef(null)
  const [showName, setShowName] = useState(false)

  useEffect(() => {
    if (!nameRef.current) return
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const obs = new IntersectionObserver(
      ([e]) => setShowName(!e.isIntersecting),
      { threshold: 0, rootMargin: `-${60 + backBarH}px 0px 0px 0px` }
    )
    obs.observe(nameRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <>
      <div ref={backBarRef} className="flex items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary truncate px-4 pointer-events-none"
          style={{ opacity: showName ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {name}
        </span>
      </div>
      <div className="mb-8 pb-5 border-b border-border-base">
        {subtitle && (
          <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
            {subtitle}
          </div>
        )}
        <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {name}
        </div>
      </div>
    </>
  )
}

export function SRDList({ results, loading, error, nextUrl, onLoadMore, renderItem, emptyMsg }) {
  return (
    <div>
      {error && (
        <div className="text-accent text-sm py-4 font-exo">{error}</div>
      )}
      {!loading && !error && results.length === 0 && (
        <div className="text-txt-muted text-sm py-10 text-center font-exo tracking-[0.1em] uppercase">
          {emptyMsg}
        </div>
      )}
      <div className="space-y-1">
        {results.map(renderItem)}
      </div>
      {loading && (
        <div className="text-txt-muted text-sm py-4 text-center font-exo tracking-[0.1em] uppercase">
          Cargando…
        </div>
      )}
      {nextUrl && !loading && (
        <div className="mt-4 text-center">
          <button className={btnSecondary} onClick={onLoadMore}>Ver más</button>
        </div>
      )}
    </div>
  )
}

export function RawDataSection({ data }) {
  const { isDM } = useApp()
  const [open, setOpen] = useState(false)
  if (!isDM) return null
  return (
    <div className="mt-8 pt-6 border-t border-border-base">
      <button className={btnSecondary} onClick={() => setOpen(o => !o)}>
        {'{ }'} {open ? 'Ocultar datos raw' : 'Ver datos raw'}
      </button>
      {open && (
        <pre className="mt-3 text-[11px] text-txt-muted font-mono overflow-x-auto bg-[#0a0a0a] border border-border-base p-4 leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
