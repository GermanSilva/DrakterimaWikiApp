import { FormGroup, FormRow } from '../../../components/FormModal'
import { labelCls, inputCls } from '../../../constants'
import { ABILITY_SCORES } from '../pjConstants'
import { abilityMod, passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'
import SkillsProficiencyGrid from './SkillsProficiencyGrid'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJMechanicsTab({ f, setF }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const suggestedProf = suggestedProfBonus(parseInt(f.nivel) || 1)
  const passivePerc = passivePerception(f)

  return (
    <div>
      <FormRow>
        <div>
          <label className={labelCls}>Bono Proficiencia</label>
          <input className={inputCls} type="number" value={f.stat_proficiency_bonus} onChange={set('stat_proficiency_bonus')} min="2" max="6" />
          <div className="text-[11px] text-txt-muted mt-1">Sugerido para nv. {f.nivel || 1}: +{suggestedProf}</div>
        </div>
        <div><label className={labelCls}>Dados de Golpe</label><input className={inputCls} value={f.stat_hit_dice} onChange={set('stat_hit_dice')} placeholder="Ej: 5d8" /></div>
      </FormRow>
      <FormGroup>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={!!f.stat_inspiration} onChange={e => setF(p => ({ ...p, stat_inspiration: e.target.checked }))} />
          <span className={labelCls} style={{ marginBottom: 0 }}>Inspiración</span>
        </label>
      </FormGroup>

      <Separator label="Atributos" />
      <div className="px-8 mb-[18px]">
        <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3">
          {ABILITY_SCORES.map(({ label, key }) => (
            <div key={key} className="text-center">
              <label className={`${labelCls} flex justify-between items-baseline`}>
                <span>{label}</span>
                <span className="text-txt-primary font-bold">{abilityMod(parseInt(f[key]) || 10)}</span>
              </label>
              <input className={`${inputCls} text-center`} type="number" value={f[key]} onChange={set(key)} min="1" max="30" />
            </div>
          ))}
        </div>
      </div>

      <Separator label="Combate" />
      <div className="px-8 mb-[18px]">
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <div><label className={labelCls}>HP Máx.</label><input className={inputCls} type="number" value={f.stat_hp} onChange={set('stat_hp')} min="0" /></div>
          <div><label className={labelCls}>HP Actual</label><input className={inputCls} type="number" value={f.stat_hp_current} onChange={set('stat_hp_current')} min="0" /></div>
          <div><label className={labelCls}>AC</label><input className={inputCls} type="number" value={f.stat_ac} onChange={set('stat_ac')} min="0" /></div>
          <div><label className={labelCls}>Velocidad (ft)</label><input className={inputCls} type="number" value={f.stat_speed} onChange={set('stat_speed')} min="0" /></div>
          <div><label className={labelCls}>Iniciativa</label><input className={inputCls} type="number" value={f.stat_initiative} onChange={set('stat_initiative')} /></div>
        </div>
      </div>

      <Separator label="Tiradas de Salvación" />
      <div className="px-8 mb-[18px]">
        <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3">
          {ABILITY_SCORES.map(({ label, saveKey }) => (
            <label key={saveKey} className="flex flex-col items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={!!f[saveKey]} onChange={e => setF(p => ({ ...p, [saveKey]: e.target.checked }))} />
              <span className="font-exo text-[11px] text-txt-muted">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator label="Habilidades" />
      <div className="px-8 mb-[18px]">
        <div className="flex items-center gap-4 mb-3">
          <span className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em]">Percepción Pasiva:</span>
          <span className="font-exo text-[16px] font-bold text-accent-dim">{passivePerc}</span>
        </div>
        <SkillsProficiencyGrid f={f} setF={setF} />
      </div>

      <Separator label="Hechicería (opcional)" />
      <FormRow>
        <div><label className={labelCls}>DC Conjuración</label><input className={inputCls} type="number" value={f.spell_dc} onChange={set('spell_dc')} min="0" /></div>
        <div><label className={labelCls}>Bono Ataque Hechizo</label><input className={inputCls} type="number" value={f.spell_attack_bonus} onChange={set('spell_attack_bonus')} /></div>
      </FormRow>
      <FormGroup>
        <label className={labelCls}>Atributo de Conjuración</label>
        <select className={inputCls} value={f.spell_ability} onChange={set('spell_ability')}>
          <option value="INT">INT</option>
          <option value="SAB">SAB</option>
          <option value="CAR">CAR</option>
        </select>
      </FormGroup>
      <div className="px-8 mb-[18px]">
        <label className={labelCls}>Slots por Nivel — Máximos</label>
        <div className="grid grid-cols-9 gap-1.5 mt-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => (
            <div key={lvl} className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Niv {lvl}</div>
              <input
                className={`${inputCls} text-center px-1`}
                type="number" min="0" max="9"
                value={f.spell_slots[String(lvl)] ?? 0}
                onChange={e => setF(p => ({ ...p, spell_slots: { ...p.spell_slots, [String(lvl)]: parseInt(e.target.value) || 0 } }))}
              />
            </div>
          ))}
        </div>
        <label className={labelCls} style={{ marginTop: '12px' }}>Slots por Nivel — Actuales</label>
        <div className="grid grid-cols-9 gap-1.5 mt-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => (
            <div key={lvl} className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Niv {lvl}</div>
              <input
                className={`${inputCls} text-center px-1`}
                type="number" min="0" max="9"
                value={f.spell_slots_current[String(lvl)] ?? f.spell_slots[String(lvl)] ?? 0}
                onChange={e => setF(p => ({ ...p, spell_slots_current: { ...p.spell_slots_current, [String(lvl)]: parseInt(e.target.value) || 0 } }))}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator label="Tiradas de Muerte" />
      <FormRow>
        <div><label className={labelCls}>Éxitos (0–3)</label><input className={inputCls} type="number" value={f.stat_death_saves_success} onChange={set('stat_death_saves_success')} min="0" max="3" /></div>
        <div><label className={labelCls}>Fallos (0–3)</label><input className={inputCls} type="number" value={f.stat_death_saves_failure} onChange={set('stat_death_saves_failure')} min="0" max="3" /></div>
      </FormRow>
    </div>
  )
}
