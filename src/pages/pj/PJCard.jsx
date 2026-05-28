import { useApp } from '../../AppContext'
import { Tag, RegionTag } from '../../components/Shared'
import { Lock, Shield } from 'lucide-react'
import { ABILITY_SCORES } from './pjConstants'
import { abilityMod, signedBonus } from '../../helpers/pjCalc'


function ModStatBox({ label, base }) {
  const mod = abilityMod(base)
  return (
    <div className="group flex flex-col items-center gap-0.5">
      <span className="font-exo text-[14px] tracking-[0.08em] text-txt-muted uppercase leading-none">{label}</span>
      <div className="relative h-[16px] flex items-center justify-center min-w-[24px]">
        <span className="font-exo text-[16px] font-bold text-txt-primary group-hover:opacity-0 transition-opacity duration-150 leading-none">{mod}</span>
        <span className="absolute inset-0 flex items-center justify-center font-exo text-[16px] font-bold text-accent-dim opacity-0 group-hover:opacity-100 transition-opacity duration-150 leading-none">{base}</span>
      </div>
    </div>
  )
}

export default function PJCard({ pj, onClick }) {
  const { isDM } = useApp()
  const hasStats = pj.stat_hp || pj.stat_ac || pj.stat_str || pj.stat_dex || pj.stat_con || pj.stat_int || pj.stat_wis || pj.stat_cha

  return (
    <div
      className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-exo text-[16px] font-semibold text-txt-primary tracking-[0.03em]">{pj.nombre}</div>
        <div className="flex items-center gap-1.5">
          {isDM && pj.notas && <Lock size={10} className="opacity-45" title="Tiene notas DM" />}
          <Shield size={16} className="opacity-55" />
        </div>
      </div>
      <div className="font-exo text-[14px] text-txt-muted font-medium mb-2.5">
        {pj.jugador || <span className="text-txt-muted">Sin asignar</span>}
      </div>
      <div className="flex flex-wrap gap-[5px] mb-2.5">
        <Tag cls="pj" text={`${pj.clase} - Nv. ${pj.nivel || 1}`} />
        {pj.raza && <Tag cls="neutral" text={pj.raza} />}
        {pj.region && <RegionTag region={pj.region} />}
        {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
        {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
      </div>
      <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
        {pj.trasfondo || 'Sin trasfondo registrado.'}
      </div>
      {hasStats && (
        <div className="mt-2.5 pt-2.5 border-t border-border-base">
          <div className="flex justify-evenly gap-3 mb-2 flex-wrap">
            {pj.stat_hp > 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">HP</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{pj.stat_hp}</span>
              </div>
            )}
            {pj.stat_ac > 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">AC</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{pj.stat_ac}</span>
              </div>
            )}
            {pj.stat_speed > 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">Vel.</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{pj.stat_speed}ft</span>
              </div>
            )}
            {pj.stat_initiative !== undefined && pj.stat_initiative !== 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">Init.</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{signedBonus(pj.stat_initiative)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-between">
            {ABILITY_SCORES.map(({ label, key }) => (
              <ModStatBox key={key} label={label} base={pj[key] ?? 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
