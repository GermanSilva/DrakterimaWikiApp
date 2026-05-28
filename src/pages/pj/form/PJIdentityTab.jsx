import { FormGroup, FormRow, EstadoField } from '../../../components/FormModal'
import { regionOptions, regionLabel } from '../../../helpers'
import { useApp } from '../../../AppContext'
import { labelCls, inputCls } from '../../../constants'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJIdentityTab({ f, setF, isDM, item, isOwnPlayer, newPlayerPwd, setNewPlayerPwd, showPlayerPwd, setShowPlayerPwd, accessStatus, handleResetAccess }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const { activeFieldRef } = useApp()

  return (
    <div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Jugador</label><input className={inputCls} value={f.jugador} onChange={set('jugador')} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Clase</label><input className={inputCls} value={f.clase} onChange={set('clase')} placeholder="Ej: Paladín, Pícaro..." /></div>
        <div><label className={labelCls}>Raza / Especie</label><input className={inputCls} value={f.raza} onChange={set('raza')} placeholder="Ej: Humano, Dracónido..." /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Trasfondo D&D</label><input className={inputCls} value={f.trasfondo_dnd} onChange={set('trasfondo_dnd')} placeholder="Ej: Soldado, Sabio, Criminal..." /></div>
        <div><label className={labelCls}>Alineamiento</label><input className={inputCls} value={f.alineamiento} onChange={set('alineamiento')} placeholder="Ej: Leal Bueno" /></div>
      </FormRow>
      <FormRow>
        {!isOwnPlayer && (
          <div>
            <label className={labelCls}>Nivel</label>
            <input className={inputCls} type="number" value={f.nivel} onChange={set('nivel')} min="1" max="20" />
          </div>
        )}
        <div>
          <label className={labelCls}>Región de Origen</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        {!isOwnPlayer && (
          <div><label className={labelCls}>Experiencia (XP)</label><input className={inputCls} type="number" value={f.experiencia} onChange={set('experiencia')} min="0" /></div>
        )}
        <div className="flex items-end">
          <div className="w-full">
            <label className={labelCls}>Imagen (URL externa)</label>
            <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
          </div>
        </div>
      </FormRow>
      {f.imagen_url && (
        <FormGroup>
          <img src={f.imagen_url} alt="preview" className="max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        </FormGroup>
      )}

      <Separator label="Apariencia Física" />
      <FormRow>
        <div><label className={labelCls}>Edad</label><input className={inputCls} value={f.edad} onChange={set('edad')} /></div>
        <div><label className={labelCls}>Altura</label><input className={inputCls} value={f.altura} onChange={set('altura')} placeholder="Ej: 1.75m" /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Peso</label><input className={inputCls} value={f.peso} onChange={set('peso')} /></div>
        <div><label className={labelCls}>Ojos</label><input className={inputCls} value={f.ojos} onChange={set('ojos')} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Piel</label><input className={inputCls} value={f.piel} onChange={set('piel')} /></div>
        <div><label className={labelCls}>Pelo</label><input className={inputCls} value={f.pelo} onChange={set('pelo')} /></div>
      </FormRow>
      <FormGroup>
        <label className={labelCls}>Notas de Apariencia</label>
        <textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.apariencia} onChange={set('apariencia')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'apariencia' } }} />
      </FormGroup>

      <Separator label="Personalidad" />
      <FormRow>
        <div><label className={labelCls}>Rasgos de Personalidad</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.personalidad} onChange={set('personalidad')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'personalidad' } }} /></div>
        <div><label className={labelCls}>Ideales</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.ideales} onChange={set('ideales')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'ideales' } }} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Vínculos</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.vinculos} onChange={set('vinculos')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'vinculos' } }} /></div>
        <div><label className={labelCls}>Defectos</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.defectos} onChange={set('defectos')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'defectos' } }} /></div>
      </FormRow>

      <Separator label="Trasfondo & Campaña" />
      <FormGroup><label className={labelCls}>Trasfondo / Historia</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.trasfondo} onChange={set('trasfondo')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'trasfondo' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Motivación para unirse al Gremio</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.motivo} onChange={set('motivo')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'motivo' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Relación con la Magralita</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.magralita} onChange={set('magralita')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'magralita' } }} /></FormGroup>
      {isDM && <FormGroup><label className={labelCls}>Notas del DM (privadas 🔒)</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>}

      {isDM && <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />}
    </div>
  )
}
