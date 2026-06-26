import { FormGroup } from '../../../components/FormModal'
import { labelCls, inputCls } from '../../../constants'
import { useApp } from '../../../AppContext'
import AttacksCRUD from './AttacksCRUD'
import SpellsCRUD from './SpellsCRUD'
import EquipmentCRUD from './EquipmentCRUD'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJInventoryTab({ f, setF }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const { activeFieldRef } = useApp()

  return (
    <div>
      <Separator label="Ataques" />
      <div className="px-8 mb-[18px]">
        <AttacksCRUD
          ataques={f.ataques}
          onChange={items => setF(p => ({ ...p, ataques: items }))}
        />
      </div>

      <Separator label="Hechizos" />
      <div className="px-8 mb-[18px]">
        <SpellsCRUD
          hechizos={f.hechizos}
          onChange={items => setF(p => ({ ...p, hechizos: items }))}
        />
      </div>

      <Separator label="Equipo" />
      <div className="px-8 mb-[18px]">
        <EquipmentCRUD
          equipo={f.equipo}
          monedas={f.monedas}
          monedas_guardado={f.monedas_guardado}
          onEquipoChange={items => setF(p => ({ ...p, equipo: items }))}
          onMonedasChange={m => setF(p => ({ ...p, monedas: m }))}
          onMonedasGuardadoChange={m => setF(p => ({ ...p, monedas_guardado: m }))}
        />
      </div>

      <Separator label="Proficiencias & Rasgos" />
      <FormGroup>
        <label className={labelCls}>Idiomas</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.idiomas} onChange={set('idiomas')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'idiomas' } }}
          placeholder="Ej: Común, Élfico, Enano" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Prof. Armas</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.prof_armas} onChange={set('prof_armas')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'prof_armas' } }} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Prof. Armaduras</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.prof_armaduras} onChange={set('prof_armaduras')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'prof_armaduras' } }} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Prof. Herramientas</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.prof_herramientas} onChange={set('prof_herramientas')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'prof_herramientas' } }} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Rasgos de Clase</label>
        <textarea className={`${inputCls} resize-y min-h-[120px]`} rows={5} value={f.rasgos_clase} onChange={set('rasgos_clase')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'rasgos_clase' } }}
          placeholder="Rasgos y habilidades de clase, subclase..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Otros Rasgos</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.otros_rasgos} onChange={set('otros_rasgos')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'otros_rasgos' } }} />
      </FormGroup>
    </div>
  )
}
