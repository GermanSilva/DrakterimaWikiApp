import { useFormSystem } from '../../../ports'

/** Renders its children only while the campaign's system document keeps this block of the character sheet on. */
export default function SheetBlock({ id, children }) {
  const system = useFormSystem()
  return system.character.sections[id] ? children : null
}
