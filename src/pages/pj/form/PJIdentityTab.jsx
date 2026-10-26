import { FormGroup, FormRow, EstadoField } from '../../../components/forms/formFields'
import { useFormActions, useFormPort, useFormSystem } from '../../../ports'
import SheetBlock from './SheetBlock'
import { labelCls, inputCls } from '../../../constants'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJIdentityTab({ f, setF, isDM, isOwnPlayer }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const { activeFieldRef } = useFormActions()
  const { regions, characterFields = [], motivoLabel = 'Motivación' } = useFormPort()
  const system = useFormSystem()
  const { clase, raza, nivel } = system.character.builtins
  // the stock D&D names keep the wording of the form; a renamed field shows exactly what the DM typed
  const razaLabel = raza.label === 'Raza' ? 'Raza / Especie' : raza.label

  return (
    <div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Jugador</label><input className={inputCls} value={f.jugador} onChange={set('jugador')} /></div>
      </FormRow>
      {(clase.enabled || raza.enabled) && (
        <FormRow>
          {clase.enabled && <div><label className={labelCls}>{clase.label}</label><input className={inputCls} value={f.clase} onChange={set('clase')} placeholder={clase.label === 'Clase' ? 'Ej: Paladín, Pícaro...' : undefined} /></div>}
          {raza.enabled && <div><label className={labelCls}>{razaLabel}</label><input className={inputCls} value={f.raza} onChange={set('raza')} placeholder={raza.label === 'Raza' ? 'Ej: Humano, Dracónido...' : undefined} /></div>}
        </FormRow>
      )}
      <SheetBlock id="stats">
        <FormRow>
          <div><label className={labelCls}>Trasfondo D&D</label><input className={inputCls} value={f.trasfondo_dnd} onChange={set('trasfondo_dnd')} placeholder="Ej: Soldado, Sabio, Criminal..." /></div>
          <div><label className={labelCls}>Alineamiento</label><input className={inputCls} value={f.alineamiento} onChange={set('alineamiento')} placeholder="Ej: Leal Bueno" /></div>
        </FormRow>
      </SheetBlock>
      <FormRow>
        {!isOwnPlayer && nivel.enabled && (
          <div>
            <label className={labelCls}>{nivel.label}</label>
            <input className={inputCls} type="number" value={f.nivel} onChange={set('nivel')} min={nivel.min} max={nivel.max} />
          </div>
        )}
        <div>
          <label className={labelCls}>Región de Origen</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {f.region && !regions.some(r => r.key === f.region) && <option value={f.region}>{f.region}</option>}
            {regions.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        {!isOwnPlayer && system.character.sections.stats && (
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

      <SheetBlock id="apariencia">
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
      </SheetBlock>

      <SheetBlock id="narrativa">
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
        <FormGroup><label className={labelCls}>{motivoLabel}</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.motivo} onChange={set('motivo')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'motivo' } }} /></FormGroup>
      </SheetBlock>

      {characterFields.map(field => {
        // legacy: flat key on the document; hub: a key of data.custom_fields
        const value = field.flat ? (f[field.key] ?? '') : (f.custom_fields?.[field.key] ?? '')
        const update = text => setF(p => (field.flat ? { ...p, [field.key]: text } : { ...p, custom_fields: { ...p.custom_fields, [field.key]: text } }))
        // The wiki-link picker writes `{ [key]: text }` through this setter: for a custom field it lands in custom_fields.
        const fieldSetter = field.flat
          ? setF
          : updater =>
              setF(p => ({
                ...p,
                custom_fields: { ...p.custom_fields, [field.key]: updater({ [field.key]: p.custom_fields?.[field.key] ?? '' })[field.key] },
              }))
        return (
          <FormGroup key={field.key}>
            <label className={labelCls} htmlFor={`pj-field-${field.key}`}>{field.label}</label>
            <textarea
              id={`pj-field-${field.key}`}
              className={`${inputCls} resize-y min-h-[70px]`}
              rows={2}
              value={value}
              onChange={e => update(e.target.value)}
              onFocus={e => { activeFieldRef.current = { el: e.target, setter: fieldSetter, key: field.key } }}
            />
          </FormGroup>
        )
      })}
      {isDM && <FormGroup><label className={labelCls}>Notas del DM (privadas 🔒)</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>}

      {isDM && <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />}
    </div>
  )
}
