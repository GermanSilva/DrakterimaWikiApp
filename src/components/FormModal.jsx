import { useApp } from '../AppContext'
import DisponibilidadForm from '../pages/DisponibilidadForm'
import { ENTITY_FORMS, FORM_TITLES } from './forms/entityForms'
import FormShell from './FormShell'

const FORM_COMPONENTS = {
  ...ENTITY_FORMS,
  disponibilidad: DisponibilidadForm,
}

/**
 * Legacy host of the modal frame: reads the form state and the data from `useApp()` and hands the
 * frame plain callbacks. The hub uses FormShell through EntityFormHost instead.
 */
export default function FormModal({ form }) {
  const { db, save, remove, closeForm, activeFieldRef } = useApp()
  const collectionKey = form.type === 'avances' ? 'sesiones' : form.type
  const item = form.id !== null ? (db[collectionKey] || []).find(x => x.id === form.id) ?? null : null

  const titles = FORM_TITLES[form.type]
  let title = titles ? (item ? titles[1] : titles[0]) : ''
  if (form.type === 'disponibilidad' && (item?.tipo ?? form.prefill?.tipo) === 'sesion') {
    title = item ? 'Editar sesión' : 'Nueva sesión'
  }

  return (
    <FormShell
      type={form.type}
      title={title}
      FormComponent={FORM_COMPONENTS[form.type]}
      item={item}
      prefill={form.prefill ?? null}
      isPJForm={form.type === 'pjs'}
      showWikiLinks={form.type !== 'disponibilidad'}
      onSave={save}
      onRemove={remove}
      onClose={closeForm}
      activeFieldRef={activeFieldRef}
    />
  )
}
