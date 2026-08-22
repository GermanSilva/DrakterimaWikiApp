import { useState } from 'react'
import { useApp } from '../AppContext'
import { FormRow } from '../components/FormModal'
import { inputCls, labelCls, btnPrimary, btnSecondary, btnDanger } from '../constants'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DisponibilidadForm({ item, prefill }) {
  const { save, remove, closeForm, currentPlayer } = useApp()
  const base = prefill?.fecha ?? today()
  const [f, setF] = useState({
    fecha_inicio: item?.fecha_inicio ?? base,
    fecha_fin: item?.fecha_fin ?? base,
    hora_inicio: item?.hora_inicio ?? '',
    hora_fin: item?.hora_fin ?? '',
  })

  function setFechaInicio(v) {
    setF(p => ({ ...p, fecha_inicio: v, fecha_fin: v }))
  }

  function setFechaFin(v) {
    setF(p => v < p.fecha_inicio
      ? { ...p, fecha_inicio: v, fecha_fin: v }
      : { ...p, fecha_fin: v })
  }

  function handleSave() {
    if (!f.fecha_inicio || !f.fecha_fin || !f.hora_inicio || !f.hora_fin) {
      alert('Completá los 4 campos.')
      return
    }
    if (f.fecha_fin === f.fecha_inicio && f.hora_fin <= f.hora_inicio) {
      alert('La hora de fin debe ser posterior a la hora de inicio.')
      return
    }
    const tipo = item?.tipo ?? prefill?.tipo ?? 'personal'
    const pj_id = tipo === 'sesion' ? null : (item?.pj_id ?? currentPlayer?.id)
    save('disponibilidad', { ...f, id: item?.id, tipo, pj_id })
  }

  return (
    <div>
      <FormRow>
        <div>
          <label className={labelCls}>Fecha de inicio</label>
          <input className={inputCls} type="date" value={f.fecha_inicio} onChange={e => setFechaInicio(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Fecha de fin</label>
          <input className={inputCls} type="date" value={f.fecha_fin} onChange={e => setFechaFin(e.target.value)} />
        </div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Hora de inicio</label>
          <input className={inputCls} type="time" value={f.hora_inicio} onChange={e => setF(p => ({ ...p, hora_inicio: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Hora de fin</label>
          <input className={inputCls} type="time" value={f.hora_fin} onChange={e => setF(p => ({ ...p, hora_fin: e.target.value }))} />
        </div>
      </FormRow>
      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('disponibilidad', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
