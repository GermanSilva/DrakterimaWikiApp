import { useState } from 'react'
import { useApp } from '../../AppContext'
import { btnPrimary, btnSecondary, btnDanger } from '../../components/FormModal'
import PJIdentityTab from './form/PJIdentityTab'
import PJMechanicsTab from './form/PJMechanicsTab'
import PJInventoryTab from './form/PJInventoryTab'

export default function PJForm({ item }) {
  const { save, remove, closeForm, isDM, currentPlayer } = useApp()
  const isOwnPlayer = !isDM && currentPlayer?.id === item?.id

  const TABS = [
    { id: 'identidad', label: 'Identidad' },
    ...(!isOwnPlayer ? [
      { id: 'mecanicas', label: 'Mecánicas' },
      { id: 'inventario', label: 'Equipo & Rasgos' },
    ] : []),
  ]
  const [tab, setTab] = useState('identidad')
  const [newPlayerPwd, setNewPlayerPwd] = useState('')
  const [showPlayerPwd, setShowPlayerPwd] = useState(false)

  const [f, setF] = useState({
    // Core identity
    nombre: item?.nombre ?? '',
    jugador: item?.jugador ?? '',
    clase: item?.clase ?? '',
    raza: item?.raza ?? '',
    nivel: item?.nivel ?? 1,
    region: item?.region ?? 'magral',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
    // Extended identity
    trasfondo_dnd: item?.trasfondo_dnd ?? '',
    alineamiento: item?.alineamiento ?? '',
    experiencia: item?.experiencia ?? 0,
    // Physical
    edad: item?.edad ?? '',
    altura: item?.altura ?? '',
    peso: item?.peso ?? '',
    ojos: item?.ojos ?? '',
    piel: item?.piel ?? '',
    pelo: item?.pelo ?? '',
    apariencia: item?.apariencia ?? '',
    // Personality
    personalidad: item?.personalidad ?? '',
    ideales: item?.ideales ?? '',
    vinculos: item?.vinculos ?? '',
    defectos: item?.defectos ?? '',
    // Narrative
    trasfondo: item?.trasfondo ?? '',
    motivo: item?.motivo ?? '',
    magralita: item?.magralita ?? '',
    notas: item?.notas ?? '',
    // Combat mechanics
    stat_str: item?.stat_str ?? 0,
    stat_dex: item?.stat_dex ?? 0,
    stat_con: item?.stat_con ?? 0,
    stat_int: item?.stat_int ?? 0,
    stat_wis: item?.stat_wis ?? 0,
    stat_cha: item?.stat_cha ?? 0,
    stat_hp: item?.stat_hp ?? 0,
    stat_ac: item?.stat_ac ?? 0,
    stat_speed: item?.stat_speed ?? 0,
    stat_initiative: item?.stat_initiative ?? 0,
    stat_proficiency_bonus: item?.stat_proficiency_bonus ?? 2,
    stat_inspiration: item?.stat_inspiration ?? false,
    stat_hit_dice: item?.stat_hit_dice ?? '',
    stat_death_saves_success: item?.stat_death_saves_success ?? 0,
    stat_death_saves_failure: item?.stat_death_saves_failure ?? 0,
    // Saving throws
    save_str: item?.save_str ?? false,
    save_dex: item?.save_dex ?? false,
    save_con: item?.save_con ?? false,
    save_int: item?.save_int ?? false,
    save_wis: item?.save_wis ?? false,
    save_cha: item?.save_cha ?? false,
    // Skills
    skill_acrobatics: item?.skill_acrobatics ?? 0,
    skill_animal_handling: item?.skill_animal_handling ?? 0,
    skill_arcana: item?.skill_arcana ?? 0,
    skill_athletics: item?.skill_athletics ?? 0,
    skill_deception: item?.skill_deception ?? 0,
    skill_history: item?.skill_history ?? 0,
    skill_insight: item?.skill_insight ?? 0,
    skill_intimidation: item?.skill_intimidation ?? 0,
    skill_investigation: item?.skill_investigation ?? 0,
    skill_medicine: item?.skill_medicine ?? 0,
    skill_nature: item?.skill_nature ?? 0,
    skill_perception: item?.skill_perception ?? 0,
    skill_performance: item?.skill_performance ?? 0,
    skill_persuasion: item?.skill_persuasion ?? 0,
    skill_religion: item?.skill_religion ?? 0,
    skill_sleight_of_hand: item?.skill_sleight_of_hand ?? 0,
    skill_stealth: item?.skill_stealth ?? 0,
    skill_survival: item?.skill_survival ?? 0,
    // Proficiencies & languages
    idiomas: item?.idiomas ?? '',
    prof_armas: item?.prof_armas ?? '',
    prof_armaduras: item?.prof_armaduras ?? '',
    prof_herramientas: item?.prof_herramientas ?? '',
    rasgos_clase: item?.rasgos_clase ?? '',
    otros_rasgos: item?.otros_rasgos ?? '',
    // Spellcasting
    spell_dc: item?.spell_dc ?? 0,
    spell_attack_bonus: item?.spell_attack_bonus ?? 0,
    spell_ability: item?.spell_ability ?? 'INT',
    spell_slots: item?.spell_slots ?? {},
    hechizos: item?.hechizos ?? [],
    // Attacks & equipment
    ataques: item?.ataques ?? [],
    equipo: item?.equipo ?? [],
    monedas: item?.monedas ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  })

  const accessStatus = !item?.player_password
    ? <span className="text-txt-muted">Sin acceso</span>
    : item.player_must_change
      ? <span className="text-accent-bright">Debe cambiar contraseña</span>
      : <span className="text-[#7aad82]">Activo</span>

  function handleResetAccess() {
    save('pjs', { ...f, id: item?.id, nivel: parseInt(f.nivel) || 1, player_password: '', player_must_change: false })
  }

  function handleSave() {
    const data = {
      ...f,
      id: item?.id,
      nivel: parseInt(f.nivel) || 1,
      experiencia: parseInt(f.experiencia) || 0,
      stat_str: parseInt(f.stat_str) || 0,
      stat_dex: parseInt(f.stat_dex) || 0,
      stat_con: parseInt(f.stat_con) || 0,
      stat_int: parseInt(f.stat_int) || 0,
      stat_wis: parseInt(f.stat_wis) || 0,
      stat_cha: parseInt(f.stat_cha) || 0,
      stat_hp: parseInt(f.stat_hp) || 0,
      stat_ac: parseInt(f.stat_ac) || 0,
      stat_speed: parseInt(f.stat_speed) || 0,
      stat_initiative: parseInt(f.stat_initiative) || 0,
      stat_proficiency_bonus: parseInt(f.stat_proficiency_bonus) || 2,
      stat_death_saves_success: parseInt(f.stat_death_saves_success) || 0,
      stat_death_saves_failure: parseInt(f.stat_death_saves_failure) || 0,
      spell_dc: parseInt(f.spell_dc) || 0,
      spell_attack_bonus: parseInt(f.spell_attack_bonus) || 0,
    }
    if (newPlayerPwd.trim()) {
      data.player_password = newPlayerPwd.trim()
      data.player_must_change = true
    } else {
      data.player_password = item?.player_password ?? ''
      data.player_must_change = item?.player_must_change ?? false
    }
    save('pjs', data)
  }

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-0 border-b border-border-base">
        <div className="mb-0 pb-4">{item ? 'Editar PJ' : 'Nuevo Personaje Jugador'}</div>
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-5 py-2.5 border-none cursor-pointer transition-colors ${tab === t.id ? 'text-txt-primary border-b-2 border-b-accent bg-transparent' : 'text-txt-muted bg-transparent hover:text-txt-secondary border-b-2 border-b-transparent'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-5">
        {tab === 'identidad' && (
          <PJIdentityTab
            f={f} setF={setF} isDM={isDM} item={item}
            isOwnPlayer={isOwnPlayer}
            newPlayerPwd={newPlayerPwd} setNewPlayerPwd={setNewPlayerPwd}
            showPlayerPwd={showPlayerPwd} setShowPlayerPwd={setShowPlayerPwd}
            accessStatus={accessStatus} handleResetAccess={handleResetAccess}
          />
        )}
        {tab === 'mecanicas' && <PJMechanicsTab f={f} setF={setF} />}
        {tab === 'inventario' && <PJInventoryTab f={f} setF={setF} />}
      </div>

      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && !isOwnPlayer && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
