import { useState } from 'react'
import { useApp } from '../AppContext'
import { regionLabel, regionOptions } from '../helpers'
import PJForm from '../pages/pj/PJForm'
import { Lock, Link } from 'lucide-react'
import WikiLinkPicker from './WikiLinkPicker'
import { btnSecondary, btnDanger, btnPrimary, inputCls, labelCls } from '../constants'

const labelLock = (< Lock size={12} className='text-accent-bright' />)

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
  const { db, save, remove, closeForm, activeFieldRef } = useApp()
  const [f, setF] = useState({
    numero: item?.numero ?? (db.sesiones.length + 1),
    fecha: item?.fecha ?? '',
    titulo: item?.titulo ?? '',
    resumen: item?.resumen ?? '',
    logros: item?.logros ?? '',
    ganchos: item?.ganchos ?? '',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
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
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.resumen} onChange={set('resumen')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'resumen' } }}
          placeholder="¿Qué ocurrió en la sesión?" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Logros / Momentos importantes</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.logros} onChange={set('logros')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'logros' } }}
          placeholder="Decisiones clave, revelaciones..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>{labelLock}Ganchos pendientes (próxima sesión)</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.ganchos} onChange={set('ganchos')}
          onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'ganchos' } }}
          placeholder="¿Qué quedó sin resolver?" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Imagen (URL externa)</label>
        <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
        {f.imagen_url && (
          <img src={f.imagen_url} alt="preview" className="mt-2 max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        )}
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

function PNJForm({ item }) {
  const { save, remove, closeForm, activeFieldRef } = useApp()
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
            {['neutral', 'aliado', 'enemigo', 'desconocido'].map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Facción / Organización</label><input className={inputCls} value={f.faccion} onChange={set('faccion')} placeholder="Ej: Orden de Argan..." /></FormGroup>
      <FormGroup><label className={labelCls}>Descripción física y personalidad</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Historia / Contexto</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.historia} onChange={set('historia')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'historia' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>{labelLock}Motivaciones secretas</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.secreto} onChange={set('secreto')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'secreto' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>{labelLock}Notas del DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>
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
  const { save, remove, closeForm, activeFieldRef } = useApp()
  const tipoOpts = ['ciudad', 'fortaleza', 'aldea', 'dungeon', 'región', 'otro']
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
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>{labelLock}Notas del DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>
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
  const { save, remove, closeForm, activeFieldRef } = useApp()
  const tipoOpts = ['institución', 'militar', 'facción', 'gremio', 'culto', 'otro']
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
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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
            {['neutral', 'aliado', 'enemigo'].map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormGroup><label className={labelCls}>Descripción</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>{labelLock}Objetivos secretos</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.secreto} onChange={set('secreto')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'secreto' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>{labelLock}Notas DM</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={2} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>
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
  const { save, remove, closeForm, activeFieldRef } = useApp()
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
      <FormGroup><label className={labelCls}>Título</label><input className={inputCls} value={f.titulo} onChange={set('titulo')} /></FormGroup>
      <FormGroup>
        <label className={labelCls}>Categoría</label>
        <input className={inputCls} value={f.categoria} onChange={set('categoria')} placeholder="Ej: historia, geografía, recurso, magia..." />
      </FormGroup>
      <FormGroup><label className={labelCls}>Descripción (pública / conocida)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>{labelLock}Información secreta (solo DM)</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.notas} onChange={set('notas')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'notas' } }} /></FormGroup>
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
  const { save, remove, closeForm, activeFieldRef } = useApp()
  const tipoOpts = ['arma', 'armadura', 'objeto maravilloso', 'foco arcano', 'poción', 'pergamino', 'anillo', 'varita', 'bastón', 'otro']
  const rarezaOpts = ['común', 'infrecuente', 'raro', 'muy raro', 'legendario', 'artefacto']
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
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={set('tipo')}>
            {tipoOpts.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Rareza</label>
          <select className={inputCls} value={f.rareza} onChange={set('rareza')}>
            {rarezaOpts.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
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
      <FormGroup><label className={labelCls}>Descripción y propiedades</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={5} value={f.descripcion} onChange={set('descripcion')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'descripcion' } }} /></FormGroup>
      <FormGroup><label className={labelCls}>Historia / Lore del objeto</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.lore} onChange={set('lore')}
        onFocus={e => { activeFieldRef.current = { el: e.target, setter: setF, key: 'lore' } }} /></FormGroup>
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

const FORM_TITLES = {
  sesiones: ['Nueva Sesión', 'Editar Sesión'],
  pnjs: ['Nuevo PNJ', 'Editar PNJ'],
  lugares: ['Nuevo Lugar', 'Editar Lugar'],
  facciones: ['Nueva Facción', 'Editar Facción'],
  lore: ['Nueva Entrada de Lore', 'Editar Lore'],
  items: ['Nuevo Ítem', 'Editar Ítem'],
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
  const { db, closeForm, activeFieldRef } = useApp()
  const [pickerOpen, setPickerOpen] = useState(false)
  const item = form.id !== null ? (db[form.type] || []).find(x => x.id === form.id) ?? null : null
  const FormComponent = FORM_COMPONENTS[form.type]
  const isPJForm = form.type === 'pjs'

  function handleInsert(wikiLink) {
    const field = activeFieldRef.current
    if (!field) return
    const { el, setter, key } = field
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const newValue = el.value.slice(0, start) + wikiLink + el.value.slice(end)
    setter(prev => ({ ...prev, [key]: newValue }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + wikiLink.length, start + wikiLink.length)
    })
  }

  const titles = FORM_TITLES[form.type]
  const title = titles ? (item ? titles[1] : titles[0]) : ''

  return (
    <>
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
          {/* Extracted header for all non-PJForm types */}
          {!isPJForm && (
            <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base flex items-center justify-between">
              <span>{title}</span>
              <button
                type="button"
                className={`${btnSecondary} flex items-center gap-1.5`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setPickerOpen(true)}
              >
                <Link size={13} />
                Insertar enlace
              </button>
            </div>
          )}
          {FormComponent
            ? <FormComponent item={item} openPicker={isPJForm ? () => setPickerOpen(true) : undefined} />
            : null}
        </div>
      </div>
      {pickerOpen && (
        <WikiLinkPicker
          onInsert={handleInsert}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
