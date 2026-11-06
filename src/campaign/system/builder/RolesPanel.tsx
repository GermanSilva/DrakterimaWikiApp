import { ROLE_NAMES, type RoleName } from '../sheet/sheetModel'
import { useBuilder } from './builderContext'
import { isNode, type Node } from './draft'
import { SelectInput } from './ui'

const ROLE_LABEL: Record<RoleName, string> = {
  hp: 'Vida máxima',
  hp_current: 'Vida actual',
  ac: 'Clase de armadura',
  speed: 'Velocidad',
  initiative: 'Iniciativa',
}

const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])

/** The number fields of the whole sheet, in sheet order. */
function numberFields(draft: Node): { key: string; label: string }[] {
  return nodes(draft.categories)
    .flatMap((c) => nodes(c.sections))
    .flatMap((s) => nodes(s.items))
    .filter((i) => i.kind === 'field' && i.type === 'number' && typeof i.key === 'string')
    .map((i) => ({ key: i.key as string, label: typeof i.label === 'string' ? i.label : '' }))
}

/** Binds the features that live outside the sheet (list cards, live session) to number fields. */
export function RolesPanel() {
  const { draft, edit } = useBuilder()
  const roles = isNode(draft.roles) ? draft.roles : {}
  const fields = numberFields(draft)
  return (
    <fieldset className="border border-border-base px-4 py-3 flex flex-col gap-3">
      <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Roles</legend>
      <p className="text-[12px] text-txt-muted">Las tarjetas de personajes y la sesión en vivo leen estos valores. Un rol sin asignar simplemente no se muestra.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLE_NAMES.map((role) => (
          <SelectInput
            key={role}
            label={ROLE_LABEL[role]}
            value={typeof roles[role] === 'string' ? (roles[role] as string) : ''}
            onChange={(key) =>
              edit((d) => {
                const others = Object.entries(isNode(d.roles) ? d.roles : {}).filter(([name]) => name !== role)
                return { ...d, roles: Object.fromEntries(key === '' ? others : [...others, [role, key]]) }
              })
            }
            options={[{ value: '', label: 'Sin asignar' }, ...fields.map((f) => ({ value: f.key, label: `${f.label} (${f.key})` }))]}
          />
        ))}
      </div>
    </fieldset>
  )
}
