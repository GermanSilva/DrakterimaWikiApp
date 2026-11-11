import { useBuilder } from './builderContext'
import { appendAt, isNode, moveIn, type Node } from './draft'
import { newCategory, newSection } from './factories'
import { NameAndKey } from './NameAndKey'
import { SectionPanel } from './SectionPanel'
import { PanelErrors, ReorderButtons, smallBtn } from './ui'

const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])

interface Props {
  selected: number
  onSelect: (index: number) => void
}

/** The categories (the tabs of the character editor) and the sections of the selected one. */
export function CategoryTabs({ selected, onSelect }: Props) {
  const { draft, edit, requestRemoval, hasErrorsUnder } = useBuilder()
  const categories = nodes(draft.categories)
  const index = Math.min(selected, categories.length - 1)
  const category = categories[index]
  const sections = nodes(category?.sections)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Categorías" className="flex flex-wrap gap-1">
          {categories.map((c, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              data-builder-path={`categories.${i}`}
              aria-selected={i === index}
              data-invalid={hasErrorsUnder(['categories', i]) ? true : undefined}
              onClick={() => onSelect(i)}
              className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-3 py-2 border cursor-pointer ${i === index ? 'border-accent text-txt-primary' : 'border-border-base text-txt-muted'}`}
            >
              {typeof c.label === 'string' ? c.label : ''}
              {hasErrorsUnder(['categories', i]) && <span aria-hidden="true" className="text-red-400"> ●</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={smallBtn}
          onClick={() => {
            edit((d) => appendAt(d, ['categories'], newCategory(d)))
            onSelect(categories.length)
          }}
        >
          Agregar categoría
        </button>
      </div>

      {category && (
        <div role="tabpanel" className="flex flex-col gap-3">
          <PanelErrors path={['categories', index]} />
          <NameAndKey path={['categories', index]} nameLabel="Nombre de la categoría" keyLabel="Clave de la categoría" scope="categories" />
          <ReorderButtons
            noun="categoría"
            index={index}
            count={categories.length}
            onMove={(delta) => {
              edit((d) => moveIn(d, ['categories'], index, delta))
              onSelect(index + delta)
            }}
            onRemove={() => requestRemoval(['categories'], index)}
          />
          {sections.map((s, i) => (
            <SectionPanel key={i} path={['categories', index, 'sections', i]} index={i} count={sections.length} />
          ))}
          <div>
            <button type="button" className={smallBtn} onClick={() => edit((d) => appendAt(d, ['categories', index, 'sections'], newSection(d)))}>
              Agregar sección
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

