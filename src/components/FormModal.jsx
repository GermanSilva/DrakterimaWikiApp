import { useState } from 'react'
import { useApp } from '../AppContext'
import { regionLabel, regionOptions } from '../helpers'
import { Eye, EyeOff } from 'lucide-react'

/* ── Shared field styles ── */
export const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'
export const inputCls = 'w-full bg-bg-mid border border-border-base text-txt-primary font-barlow text-sm px-3 py-2 outline-none transition-colors focus:border-accent-dim'
export const btnPrimary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none'
export const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'
export const btnDanger = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-accent border border-accent-dim hover:bg-accent/[.15]'

export function FormGroup({ children, className = '' }) {
  return <div className={`mb-[18px] px-8 ${className}`}>{children}</div>
}

export function FormRow({ children }) {
  return <div className="grid grid-cols-2 gap-3.5 px-8 mb-[18px] max-md:grid-cols-1">{children}</div>
}

export function EstadoField({ estado, visibilidad, setF }) {
  const { db } = useApp()
  return (
    <FormGroup>
      <label className={labelCls}>Visibilidad</label>
      <select
        className={inputCls}
        value={estado}
        onChange={e => setF(p => ({ ...p, estado: e.target.value }))}
      >
        <option value="publicado">Publicado</option>
        <option value="secreto">Secreto (jugadores seleccionados)</option>
        <option value="borrador">Borrador (solo DM)</option>
      </select>
      {estado === 'secreto' && db.pjs.length > 0 && (
        <div className="mt-2">
          <div className="text-[12px] text-txt-muted mb-1.5">Visible para:</div>
          <div className="flex flex-col gap-1.5">
            {db.pjs.map(pj => (
              <label key={pj.id} className="flex items-center gap-2 text-[13px] cursor-pointer text-txt-primary">
                <input
                  type="checkbox"
                  checked={(visibilidad ?? []).includes(pj.id)}
                  onChange={e => {
                    const cur = visibilidad ?? []
                    const next = e.target.checked ? [...cur, pj.id] : cur.filter(id => id !== pj.id)
                    setF(p => ({ ...p, visibilidad: next }))
                  }}
                />
                {pj.nombre}{pj.jugador ? ` (${pj.jugador})` : ''}
              </label>
            ))}
          </div>
        </div>
      )}
    </FormGroup>
  )
}

function SesionForm({ item }) {
  const { db, save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    numero: item?.numero ?? (db.sesiones.length + 1),
    fecha: item?.fecha ?? '',
    titulo: item?.titulo ?? '',
    resumen: item?.resumen ?? '',
    logros: item?.logros ?? '',
    ganchos: item?.ganchos ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar Sesión' : 'Nueva Sesión'}
      </div>
      <FormRow>
        <div>
          <label className={labelCls}>Número de Sesión</label>
          <input className={inputCls} type="number" value={f.numero} onChange={set('numero')} min="0" />
        </div>
        <div>
          <label className={labelCls}>Fecha Real</label>
          <input className={inputCls} type="date" value={f.fecha} onChange={set('fecha')} />
        </div>
      </FormRow>
      <FormGroup>
        <label className={labelCls}>Título de la Sesión</label>
        <input className={inputCls} value={f.titulo} onChange={set('titulo')} placeholder="Ej: La llegada a Kardevir" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Resumen</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.resumen} onChange={set('resumen')} placeholder="¿Qué ocurrió en la sesión?" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Logros / Momentos importantes</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.logros} onChange={set('logros')} placeholder="Decisiones clave, revelaciones..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Ganchos pendientes (próxima sesión)</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.ganchos} onChange={set('ganchos')} placeholder="¿Qué quedó sin resolver?" />
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('sesiones', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('sesiones', { ...f, id: item?.id, numero: parseInt(f.numero) || 0 })}>Guardar</button>
      </div>
    </div>
  )
}

function PJForm({ item }) {
  const { save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    jugador: item?.jugador ?? '',
    clase: item?.clase ?? '',
    raza: item?.raza ?? '',
    nivel: item?.nivel ?? 1,
    region: item?.region ?? 'magral',
    trasfondo: item?.trasfondo ?? '',
    motivo: item?.motivo ?? '',
    magralita: item?.magralita ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
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
  })
  const [newPlayerPwd, setNewPlayerPwd] = useState('')
  const [showPlayerPwd, setShowPlayerPwd] = useState(false)
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    const data = {
      ...f,
      id: item?.id,
      nivel: parseInt(f.nivel) || 1,
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

  function handleResetAccess() {
    save('pjs', { ...f, id: item?.id, nivel: parseInt(f.nivel) || 1, player_password: '', player_must_change: false })
  }

  const accessStatus = !item?.player_password
    ? <span className="text-txt-muted">Sin acceso</span>
    : item.player_must_change
      ? <span className="text-accent-bright">Debe cambiar contraseña</span>
      : <span className="text-[#7aad82]">Activo</span>

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar PJ' : 'Nuevo Personaje Jugador'}
      </div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Jugador</label><input className={inputCls} value={f.jugador} onChange={set('jugador')} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Clase</label><input className={inputCls} value={f.clase} onChange={set('clase')} placeholder="Ej: Paladín, Pícaro..." /></div>
        <div><label className={labelCls}>Raza / Especie</label><input className={inputCls} value={f.raza} onChange={set('raza')} placeholder="Ej: Humano, Dracónido..." /></div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Nivel</label>
          <input className={inputCls} type="number" value={f.nivel} onChange={set('nivel')} min="1" max="20" />
        </div>
        <div>
          <label className={labelCls}>Región de Origen</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Trasfondo / Historia</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.trasfondo} onChange={set('trasfondo')} /></FormGroup>
      <FormGroup><label className={labelCls}>Motivación para unirse al Gremio</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.motivo} onChange={set('motivo')} /></FormGroup>
      <FormGroup><label className={labelCls}>Relación con la Magralita</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.magralita} onChange={set('magralita')} /></FormGroup>
      <FormGroup><label className={labelCls}>Notas del DM (privadas)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.notas} onChange={set('notas')} /></FormGroup>

      <div className="px-8 mb-[18px]">
        <div className={`${labelCls} mb-3`}>Stats de combate</div>
        <div className="grid grid-cols-4 gap-3 mb-3 max-md:grid-cols-2">
          <div><label className={labelCls}>HP Máx.</label><input className={inputCls} type="number" value={f.stat_hp} onChange={set('stat_hp')} min="0" /></div>
          <div><label className={labelCls}>AC</label><input className={inputCls} type="number" value={f.stat_ac} onChange={set('stat_ac')} min="0" /></div>
          <div><label className={labelCls}>Velocidad (ft)</label><input className={inputCls} type="number" value={f.stat_speed} onChange={set('stat_speed')} min="0" /></div>
          <div><label className={labelCls}>Iniciativa</label><input className={inputCls} type="number" value={f.stat_initiative} onChange={set('stat_initiative')} /></div>
        </div>
        <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3">
          {[['FUE', 'stat_str'], ['DES', 'stat_dex'], ['CON', 'stat_con'], ['INT', 'stat_int'], ['SAB', 'stat_wis'], ['CAR', 'stat_cha']].map(([label, key]) => (
            <div key={key} className="text-center">
              <label className={`${labelCls} text-center block`}>{label}</label>
              <input className={`${inputCls} text-center`} type="number" value={f[key]} onChange={set(key)} min="1" max="30" />
            </div>
          ))}
        </div>
      </div>

      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      {item && (
        <FormGroup className="border-t border-border-base pt-[18px] !mb-0">
          <label className={labelCls}>Acceso del jugador</label>
          <div className="flex items-center gap-2 mb-2.5 text-[12px]">
            <span className="text-txt-muted">Estado:</span>
            {accessStatus}
          </div>
          <div className="relative">
            <input
              className={`${inputCls} pr-10`}
              type={showPlayerPwd ? 'text' : 'password'}
              placeholder="Nueva contraseña inicial…"
              value={newPlayerPwd}
              onChange={e => setNewPlayerPwd(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-txt-muted hover:text-txt-primary"
              onClick={() => setShowPlayerPwd(v => !v)}
              tabIndex={-1}
            >
              {showPlayerPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            {item.player_password && (
              <button className={btnSecondary} onClick={handleResetAccess} type="button">
                Quitar acceso
              </button>
            )}
          </div>
          <p className="text-[11px] text-txt-muted mt-1.5 mb-0">
            Al setear una contraseña nueva el jugador deberá cambiarla en su primer acceso.
          </p>
        </FormGroup>
      )}
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}

function PNJForm({ item }) {
  const { save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    rol: item?.rol ?? '',
    region: item?.region ?? 'magral',
    relacion: item?.relacion ?? 'neutral',
    faccion: item?.faccion ?? '',
    descripcion: item?.descripcion ?? '',
    historia: item?.historia ?? '',
    secreto: item?.secreto ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar PNJ' : 'Nuevo PNJ'}
      </div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Rol / Título</label><input className={inputCls} value={f.rol} onChange={set('rol')} placeholder="Ej: Comandante, Mercader..." /></div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Región</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Relación con el grupo</label>
          <select className={inputCls} value={f.relacion} onChange={set('relacion')}>
            {['neutral','aliado','enemigo','desconocido'].map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Facción / Organización</label><input className={inputCls} value={f.faccion} onChange={set('faccion')} placeholder="Ej: Orden de Argan..." /></FormGroup>
      <FormGroup><label className={labelCls}>Descripción física y personalidad</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.descripcion} onChange={set('descripcion')} /></FormGroup>
      <FormGroup><label className={labelCls}>Historia / Contexto</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.historia} onChange={set('historia')} /></FormGroup>
      <FormGroup><label className={labelCls}>Motivaciones secretas</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.secreto} onChange={set('secreto')} /></FormGroup>
      <FormGroup><label className={labelCls}>Notas del DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.notas} onChange={set('notas')} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('pnjs', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('pnjs', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}

function LugarForm({ item }) {
  const { save, remove, closeForm } = useApp()
  const tipoOpts = ['ciudad','fortaleza','aldea','dungeon','región','otro']
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    subtitulo: item?.subtitulo ?? '',
    region: item?.region ?? 'magral',
    tipo: item?.tipo ?? 'ciudad',
    descripcion: item?.descripcion ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar Lugar' : 'Nuevo Lugar'}
      </div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Subtítulo</label><input className={inputCls} value={f.subtitulo} onChange={set('subtitulo')} placeholder="Ej: Ciudad del Paso" /></div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Región</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')} /></FormGroup>
      <FormGroup><label className={labelCls}>Notas del DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.notas} onChange={set('notas')} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('lugares', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('lugares', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}

function FaccionForm({ item }) {
  const { save, remove, closeForm } = useApp()
  const tipoOpts = ['institución','militar','facción','gremio','culto','otro']
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    tipo: item?.tipo ?? 'facción',
    region: item?.region ?? 'magral',
    relacion: item?.relacion ?? 'neutral',
    descripcion: item?.descripcion ?? '',
    secreto: item?.secreto ?? '',
    notas: item?.notas ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar Facción' : 'Nueva Facción'}
      </div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Región base</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Relación con el grupo</label>
          <select className={inputCls} value={f.relacion} onChange={set('relacion')}>
            {['neutral','aliado','enemigo'].map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.descripcion} onChange={set('descripcion')} /></FormGroup>
      <FormGroup><label className={labelCls}>Objetivos secretos</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.secreto} onChange={set('secreto')} /></FormGroup>
      <FormGroup><label className={labelCls}>Notas DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.notas} onChange={set('notas')} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('facciones', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('facciones', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}

function LoreForm({ item }) {
  const { save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    titulo: item?.titulo ?? '',
    categoria: item?.categoria ?? '',
    descripcion: item?.descripcion ?? '',
    notas: item?.notas ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar Lore' : 'Nueva Entrada de Lore'}
      </div>
      <FormGroup><label className={labelCls}>Título</label><input className={inputCls} value={f.titulo} onChange={set('titulo')} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Categoría</label>
        <input className={inputCls} value={f.categoria} onChange={set('categoria')} placeholder="Ej: historia, geografía, recurso, magia..." />
      </FormGroup>
      <FormGroup><label className={labelCls}>Descripción (pública / conocida)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')} /></FormGroup>
      <FormGroup><label className={labelCls}>Información secreta (solo DM)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.notas} onChange={set('notas')} /></FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('lore', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('lore', { ...f, id: item?.id, categoria: f.categoria.toLowerCase() })}>Guardar</button>
      </div>
    </div>
  )
}

function ItemForm({ item }) {
  const { save, remove, closeForm } = useApp()
  const tipoOpts = ['arma','armadura','objeto maravilloso','foco arcano','poción','pergamino','anillo','varita','bastón','otro']
  const rarezaOpts = ['común','infrecuente','raro','muy raro','legendario','artefacto']
  const [f, setF] = useState({
    nombre: item?.nombre ?? '',
    tipo: item?.tipo ?? 'objeto maravilloso',
    rareza: item?.rareza ?? 'raro',
    requiere_sintonia: item?.requiere_sintonia ?? false,
    descripcion: item?.descripcion ?? '',
    lore: item?.lore ?? '',
    poseedor: item?.poseedor ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base">
        {item ? 'Editar Ítem' : 'Nuevo Ítem'}
      </div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Rareza</label>
          <select className={inputCls} value={f.rareza} onChange={set('rareza')}>
            {rarezaOpts.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>¿Requiere sintonía?</label>
          <select className={inputCls} value={f.requiere_sintonia ? 'si' : 'no'} onChange={e => setF(p => ({ ...p, requiere_sintonia: e.target.value === 'si' }))}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción y propiedades</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')} /></FormGroup>
      <FormGroup><label className={labelCls}>Historia / Lore del objeto</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.lore} onChange={set('lore')} /></FormGroup>
      <FormGroup><label className={labelCls}>Poseedor actual</label><input className={inputCls} value={f.poseedor} onChange={set('poseedor')} placeholder="Nombre del PJ o PNJ" /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
      </FormGroup>
      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('items', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={() => save('items', { ...f, id: item?.id })}>Guardar</button>
      </div>
    </div>
  )
}

const FORM_COMPONENTS = {
  sesiones: SesionForm,
  pjs: PJForm,
  pnjs: PNJForm,
  lugares: LugarForm,
  facciones: FaccionForm,
  lore: LoreForm,
  items: ItemForm,
}

export default function FormModal({ form }) {
  const { db, closeForm } = useApp()
  const item = form.id !== null ? (db[form.type] || []).find(x => x.id === form.id) ?? null : null
  const FormComponent = FORM_COMPONENTS[form.type]

  return (
    <div
      className="fixed inset-0 bg-black/[.82] z-[300] backdrop-blur-[4px] flex items-center justify-center"
      id="form-overlay"
      onClick={e => {
        if (e.target.id !== 'form-overlay') return
        const inputs = e.currentTarget.querySelectorAll('input, textarea, select')
        const hasData = [...inputs].some(el => el.value.trim())
        if (!hasData || confirm('¿Descartar cambios?')) closeForm()
      }}
    >
      <div className="w-[min(640px,92vw)] max-h-[88vh] bg-bg-card border border-border-light overflow-y-auto animate-fade-in">
        {FormComponent ? <FormComponent item={item} /> : null}
      </div>
    </div>
  )
}
