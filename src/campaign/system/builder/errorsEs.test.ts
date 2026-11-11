import { describe, expect, it } from 'vitest'
import { STORED_SHEET } from './builderFixture'
import { describeSheetError, ownerOf } from './errorsEs'

describe('ownerOf', () => {
  it('is the deepest part with its own panel', () => {
    expect(ownerOf(['categories', 0, 'sections', 1, 'items', 2, 'label'])).toEqual(['categories', 0, 'sections', 1, 'items', 2])
    expect(ownerOf(['categories', 0, 'sections', 1, 'items', 2, 'columns', 1, 'formula'])).toEqual(['categories', 0, 'sections', 1, 'items', 2, 'columns', 1])
    expect(ownerOf(['categories', 0, 'sections', 1, 'blocks', 0, 'filterCategories', 1])).toEqual(['categories', 0, 'sections', 1, 'blocks', 0])
    expect(ownerOf(['categories', 0, 'label'])).toEqual(['categories', 0])
    expect(ownerOf(['roles', 'hp'])).toEqual(['roles'])
    expect(ownerOf(['categories'])).toEqual([])
    expect(ownerOf([])).toEqual([])
  })
})

describe('describeSheetError', () => {
  const draft = STORED_SHEET
  it('names where the problem is by the names the DM gave', () => {
    const e = describeSheetError(draft, { path: 'categories[0].sections[0].items[1].label', message: 'invalid label' })
    expect(e.where).toBe('Categoría «General» › Sección «Perfil» › Ítem «Vida»')
    expect(e.field).toBe('Nombre')
    expect(e.text).toBe('El nombre debe tener entre 1 y 60 caracteres, sin caracteres de control ni invisibles.')
  })

  it('translates the messages of the validator and keeps what it does not know', () => {
    const say = (message: string, path = 'categories[0].label') => describeSheetError(draft, { path, message }).text
    expect(say('reserved key')).toBe('Esa clave está reservada por la aplicación. Elegí otra.')
    expect(say('unknown reference {zzz}')).toBe('La referencia {zzz} no existe.')
    expect(say('peso has no column "x"')).toBe('La tabla peso no tiene la columna "x".')
    expect(say('mode tile does not fit conjuros')).toBe('El modo tile no sirve para «conjuros».')
    expect(say('only one table can be the reward destination')).toBe('Solo una tabla puede ser el destino de recompensa.')
    expect(say('something new')).toBe('something new')
  })

  it('explains an invalid formula with the parser reason', () => {
    const bad = { categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', blocks: [], items: [{ kind: 'field', key: 'f', label: 'F', type: 'number', editableBy: 'dm', formula: '{vida' }] }] }] }
    expect(describeSheetError(bad, { path: 'categories[0].sections[0].items[0].formula', message: 'invalid formula' }).text).toBe('Fórmula no válida: falta cerrar una referencia con }.')
  })

  it('says the cycle path with the names the DM gave, or the keys when the error has no labels', () => {
    const message = 'formulas reference each other in a cycle: pasiva -> ini -> pasiva'
    const cycle = [
      { key: 'pasiva', label: 'Percepción pasiva' },
      { key: 'ini', label: 'Iniciativa' },
      { key: 'pasiva', label: 'Percepción pasiva' },
    ]
    expect(describeSheetError(draft, { path: 'categories', message, cycle })).toMatchObject({
      where: '',
      text: 'Las fórmulas se llaman en círculo: Percepción pasiva → Iniciativa → Percepción pasiva',
    })
    expect(describeSheetError(draft, { path: 'categories', message }).text).toBe('Las fórmulas se llaman en círculo: pasiva → ini → pasiva')
  })

  it('describes the sheet-wide and role errors', () => {
    expect(describeSheetError(draft, { path: 'categories', message: 'formulas reference each other in a cycle' })).toMatchObject({ where: '', text: 'Hay fórmulas que se referencian entre sí en círculo.' })
    expect(describeSheetError(draft, { path: 'roles.hp', message: 'a role is bound to a number field' })).toMatchObject({ where: 'Roles', field: 'Vida máxima', text: 'Un rol se asigna a un campo numérico.' })
  })
})
