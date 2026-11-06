import { useBuilder } from './builderContext'
import { getAt, isNode, type Path } from './draft'
import { renameNode, setKey, type KeyScope } from './factories'
import { TextInput } from './ui'

interface Props {
  path: Path
  nameLabel: string
  keyLabel: string
  scope: KeyScope
  /** Blocks are named by an optional title instead of a label. */
  field?: 'label' | 'title'
}

/**
 * The name and the key of a part. The key follows the name while the part is new and is then fixed: a saved key is where
 * the characters' data lives, so renaming it would orphan that data.
 */
export function NameAndKey({ path, nameLabel, keyLabel, scope, field = 'label' }: Props) {
  const { draft, edit } = useBuilder()
  const node = getAt(draft, path)
  const current = isNode(node) ? node : {}
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput label={nameLabel} value={text(current[field])} onChange={(value) => edit((d) => renameNode(d, path, field, value, scope))} />
      <TextInput label={keyLabel} value={text(current.key)} readOnly={current._new !== true} onChange={(value) => edit((d) => setKey(d, path, value))} />
    </div>
  )
}
