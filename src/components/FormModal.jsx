import { useState } from 'react'
import { useApp } from '../AppContext'
import { regionLabel, regionOptions } from '../helpers'

function SesionForm({ item }) {
  const { db, save, remove, closeForm } = useApp()
  const [f, setF] = useState({
    numero: item?.numero ?? (db.sesiones.length + 1),
    fecha: item?.fecha ?? '',
    titulo: item?.titulo ?? '',
    resumen: item?.resumen ?? '',
    logros: item?.logros ?? '',
    ganchos: item?.ganchos ?? '',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="form-title">{item ? 'Editar Sesión' : 'Nueva Sesión'}</div>
      <div className="form-row">
        <div className="form-group">
          <label>Número de Sesión</label>
          <input type="number" value={f.numero} onChange={set('numero')} min="0" />
        </div>
        <div className="form-group">
          <label>Fecha Real</label>
          <input type="date" value={f.fecha} onChange={set('fecha')} />
        </div>
      </div>
      <div className="form-group">
        <label>Título de la Sesión</label>
        <input value={f.titulo} onChange={set('titulo')} placeholder="Ej: La llegada a Kardevir" />
      </div>
      <div className="form-group">
        <label>Resumen</label>
        <textarea rows={5} value={f.resumen} onChange={set('resumen')} placeholder="¿Qué ocurrió en la sesión?" />
      </div>
      <div className="form-group">
        <label>Logros / Momentos importantes</label>
        <textarea rows={3} value={f.logros} onChange={set('logros')} placeholder="Decisiones clave, revelaciones..." />
      </div>
      <div className="form-group">
        <label>Ganchos pendientes (próxima sesión)</label>
        <textarea rows={3} value={f.ganchos} onChange={set('ganchos')} placeholder="¿Qué quedó sin resolver?" />
      </div>
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('sesiones', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => save('sesiones', { ...f, id: item?.id, numero: parseInt(f.numero) || 0 })}>Guardar</button>
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
  })
  const [newPlayerPwd, setNewPlayerPwd] = useState('')
  const [showPlayerPwd, setShowPlayerPwd] = useState(false)
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    const data = { ...f, id: item?.id, nivel: parseInt(f.nivel) || 1 }
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
    ? <span className="player-access-status-none">Sin acceso</span>
    : item.player_must_change
      ? <span className="player-access-status-pending">Debe cambiar contraseña</span>
      : <span className="player-access-status-active">Activo</span>

  return (
    <div>
      <div className="form-title">{item ? 'Editar PJ' : 'Nuevo Personaje Jugador'}</div>
      <div className="form-row">
        <div className="form-group"><label>Nombre</label><input value={f.nombre} onChange={set('nombre')} /></div>
        <div className="form-group"><label>Jugador</label><input value={f.jugador} onChange={set('jugador')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Clase</label><input value={f.clase} onChange={set('clase')} placeholder="Ej: Paladín, Pícaro..." /></div>
        <div className="form-group"><label>Raza / Especie</label><input value={f.raza} onChange={set('raza')} placeholder="Ej: Humano, Dracónido..." /></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Nivel</label>
          <input type="number" value={f.nivel} onChange={set('nivel')} min="1" max="20" />
        </div>
        <div className="form-group">
          <label>Región de Origen</label>
          <select value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Trasfondo / Historia</label><textarea rows={4} value={f.trasfondo} onChange={set('trasfondo')} /></div>
      <div className="form-group"><label>Motivación para unirse al Gremio</label><textarea rows={2} value={f.motivo} onChange={set('motivo')} /></div>
      <div className="form-group"><label>Relación con la Magralita</label><textarea rows={2} value={f.magralita} onChange={set('magralita')} /></div>
      <div className="form-group"><label>Notas del DM (privadas)</label><textarea rows={3} value={f.notas} onChange={set('notas')} /></div>
      {item && (
        <div className="form-group player-access-section">
          <label>Acceso del jugador</label>
          <div className="player-access-row">
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estado:</span>
            {accessStatus}
          </div>
          <div className="pwd-field">
            <input
              type={showPlayerPwd ? 'text' : 'password'}
              placeholder="Nueva contraseña inicial…"
              value={newPlayerPwd}
              onChange={e => setNewPlayerPwd(e.target.value)}
            />
            <button
              type="button"
              className="pwd-toggle"
              onClick={() => setShowPlayerPwd(v => !v)}
              tabIndex={-1}
              title={showPlayerPwd ? 'Ocultar' : 'Mostrar'}
            >
              {showPlayerPwd ? '🙈' : '👁'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {item.player_password && (
              <button className="btn btn-secondary" onClick={handleResetAccess} type="button">
                Quitar acceso
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
            Al setear una contraseña nueva el jugador deberá cambiarla en su primer acceso.
          </p>
        </div>
      )}
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('pjs', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
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
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="form-title">{item ? 'Editar PNJ' : 'Nuevo PNJ'}</div>
      <div className="form-row">
        <div className="form-group"><label>Nombre</label><input value={f.nombre} onChange={set('nombre')} /></div>
        <div className="form-group"><label>Rol / Título</label><input value={f.rol} onChange={set('rol')} placeholder="Ej: Comandante, Mercader..." /></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Región</label>
          <select value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Relación con el grupo</label>
          <select value={f.relacion} onChange={set('relacion')}>
            {['neutral','aliado','enemigo','desconocido'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Facción / Organización</label><input value={f.faccion} onChange={set('faccion')} placeholder="Ej: Orden de Argan..." /></div>
      <div className="form-group"><label>Descripción física y personalidad</label><textarea rows={4} value={f.descripcion} onChange={set('descripcion')} /></div>
      <div className="form-group"><label>Historia / Contexto</label><textarea rows={3} value={f.historia} onChange={set('historia')} /></div>
      <div className="form-group"><label>Motivaciones secretas</label><textarea rows={2} value={f.secreto} onChange={set('secreto')} /></div>
      <div className="form-group"><label>Notas del DM</label><textarea rows={2} value={f.notas} onChange={set('notas')} /></div>
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('pnjs', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => save('pnjs', { ...f, id: item?.id })}>Guardar</button>
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
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="form-title">{item ? 'Editar Lugar' : 'Nuevo Lugar'}</div>
      <div className="form-row">
        <div className="form-group"><label>Nombre</label><input value={f.nombre} onChange={set('nombre')} /></div>
        <div className="form-group"><label>Subtítulo</label><input value={f.subtitulo} onChange={set('subtitulo')} placeholder="Ej: Ciudad del Paso" /></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Región</label>
          <select value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <select value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Descripción</label><textarea rows={5} value={f.descripcion} onChange={set('descripcion')} /></div>
      <div className="form-group"><label>Notas del DM</label><textarea rows={3} value={f.notas} onChange={set('notas')} /></div>
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('lugares', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => save('lugares', { ...f, id: item?.id })}>Guardar</button>
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
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="form-title">{item ? 'Editar Facción' : 'Nueva Facción'}</div>
      <div className="form-row">
        <div className="form-group"><label>Nombre</label><input value={f.nombre} onChange={set('nombre')} /></div>
        <div className="form-group">
          <label>Tipo</label>
          <select value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Región base</label>
          <select value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Relación con el grupo</label>
          <select value={f.relacion} onChange={set('relacion')}>
            {['neutral','aliado','enemigo'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Descripción</label><textarea rows={4} value={f.descripcion} onChange={set('descripcion')} /></div>
      <div className="form-group"><label>Objetivos secretos</label><textarea rows={3} value={f.secreto} onChange={set('secreto')} /></div>
      <div className="form-group"><label>Notas DM</label><textarea rows={2} value={f.notas} onChange={set('notas')} /></div>
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('facciones', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => save('facciones', { ...f, id: item?.id })}>Guardar</button>
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
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="form-title">{item ? 'Editar Lore' : 'Nueva Entrada de Lore'}</div>
      <div className="form-group"><label>Título</label><input value={f.titulo} onChange={set('titulo')} /></div>
      <div className="form-group">
        <label>Categoría</label>
        <input value={f.categoria} onChange={set('categoria')} placeholder="Ej: historia, geografía, recurso, magia..." />
      </div>
      <div className="form-group"><label>Descripción (pública / conocida)</label><textarea rows={5} value={f.descripcion} onChange={set('descripcion')} /></div>
      <div className="form-group"><label>Información secreta (solo DM)</label><textarea rows={3} value={f.notas} onChange={set('notas')} /></div>
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('lore', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => save('lore', { ...f, id: item?.id, categoria: f.categoria.toLowerCase() })}>Guardar</button>
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
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="form-title">{item ? 'Editar Ítem' : 'Nuevo Ítem'}</div>
      <div className="form-row">
        <div className="form-group"><label>Nombre</label><input value={f.nombre} onChange={set('nombre')} /></div>
        <div className="form-group">
          <label>Tipo</label>
          <select value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Rareza</label>
          <select value={f.rareza} onChange={set('rareza')}>
            {rarezaOpts.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>¿Requiere sintonía?</label>
          <select value={f.requiere_sintonia ? 'si' : 'no'} onChange={e => setF(p => ({ ...p, requiere_sintonia: e.target.value === 'si' }))}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </div>
      </div>
      <div className="form-group"><label>Descripción y propiedades</label><textarea rows={5} value={f.descripcion} onChange={set('descripcion')} /></div>
      <div className="form-group"><label>Historia / Lore del objeto</label><textarea rows={3} value={f.lore} onChange={set('lore')} /></div>
      <div className="form-group"><label>Poseedor actual</label><input value={f.poseedor} onChange={set('poseedor')} placeholder="Nombre del PJ o PNJ" /></div>
      <div className="form-actions">
        {item && <button className="btn btn-danger" onClick={() => remove('items', item.id)}>Eliminar</button>}
        <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => save('items', { ...f, id: item?.id })}>Guardar</button>
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
      id="form-overlay"
      onClick={e => {
        if (e.target.id !== 'form-overlay') return
        const inputs = e.currentTarget.querySelectorAll('input, textarea, select')
        const hasData = [...inputs].some(el => el.value.trim())
        if (!hasData || confirm('¿Descartar cambios?')) closeForm()
      }}
    >
      <div id="form-panel">
        {FormComponent ? <FormComponent item={item} /> : null}
      </div>
    </div>
  )
}
