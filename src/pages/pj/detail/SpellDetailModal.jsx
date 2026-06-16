import { useEffect } from 'react'
import { detailSectionCls, sectionTitleCls } from '../../../constants'

export default function SpellDetailModal({ spell, onClose }) {
  const levelLabel = Number(spell.nivel) === 0 ? 'Truco' : `Nivel ${spell.nivel}`

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-base max-w-lg w-full mx-4 px-4 max-h-[80vh] overflow-y-auto pb-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="py-4 border-b border-border-base flex items-start justify-between gap-4">
          <div>
            <div className="font-exo text-[18px] font-bold text-txt-primary uppercase">{spell.nombre}</div>
            <div className="font-exo text-[11px] text-txt-muted tracking-[0.15em] uppercase mt-0.5">
              {levelLabel}
              {spell.escuela ? ` · ${spell.escuela}` : ''}
              {spell.concentracion ? ' · Concentración' : ''}
              {spell.ritual ? ' · Ritual' : ''}
            </div>
          </div>
          <button
            type="button"
            className="text-txt-muted hover:text-txt-primary text-xl leading-none shrink-0 border-none bg-transparent cursor-pointer mt-0.5"
            onClick={onClose}
          >×</button>
        </div>

        {(spell.casting_time || spell.alcance || spell.componentes || spell.duracion) && (
          <div className={detailSectionCls}>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Tiempo de lanzamiento', spell.casting_time],
                ['Alcance', spell.alcance],
                ['Componentes', spell.componentes],
                ['Duración', spell.duracion],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
                  <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {spell.descripcion && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Descripción</div>
            {spell.descripcion.split('\n').filter(Boolean).map((p, i) => (
              <p key={i} className="text-txt-secondary text-[13px] mb-2">{p}</p>
            ))}
          </div>
        )}

        {spell.a_niveles_superiores && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>A niveles superiores</div>
            <p className="text-txt-secondary text-[13px]">{spell.a_niveles_superiores}</p>
          </div>
        )}
      </div>
    </div>
  )
}
