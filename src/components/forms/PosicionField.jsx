import { useFormPort } from '../../ports'
import { inputCls, labelCls } from '../../constants'
import { FormGroup } from './formFields'

export default function PosicionField({ afterId, setAfterIdFn, currentId }) {
  const { sesiones } = useFormPort()
  const sortedAll = [...sesiones]
    .sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
    .filter(s => s.id !== currentId)
  return (
    <FormGroup>
      <label className={labelCls}>Posición en la línea de tiempo</label>
      <select
        className={inputCls}
        value={afterId === null ? '__first__' : afterId}
        onChange={e => setAfterIdFn(e.target.value === '__first__' ? null : Number(e.target.value))}
      >
        <option value="__first__">(Al principio)</option>
        {sortedAll.map(s => (
          <option key={s.id} value={s.id}>
            {s.tipo === 'avance'
              ? `[Avance] ${s.titulo || 'Sin título'}`
              : `[Sesión ${s.numero}] ${s.titulo || 'Sin título'}`}
          </option>
        ))}
      </select>
    </FormGroup>
  )
}
