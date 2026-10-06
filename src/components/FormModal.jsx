import { useRef, useState } from 'react'
import { useApp } from '../AppContext'
import PJForm from '../pages/pj/PJForm'
import { Link, X } from 'lucide-react'
import WikiLinkPicker from './WikiLinkPicker'
import MapaForm from '../pages/MapaForm'
import MapPointForm from '../pages/MapPointForm'
import DisponibilidadForm from '../pages/DisponibilidadForm'
import SesionForm from './forms/SesionForm'
import AvanceForm from './forms/AvanceForm'
import PNJForm from './forms/PNJForm'
import LugarForm from './forms/LugarForm'
import FaccionForm from './forms/FaccionForm'
import LoreForm from './forms/LoreForm'
import ItemForm from './forms/ItemForm'
import HomeruleForm from './forms/HomeruleForm'
import useDialogFocus from '../hooks/useDialogFocus'
import useBackdropClose from '../hooks/useBackdropClose'
import { btnSecondary } from '../constants'

const FIRST_FIELD = 'input:not([type=hidden]), textarea, select'

const FORM_TITLES = {
  sesiones: ['Nueva Sesión', 'Editar Sesión'],
  avances: ['Nuevo Avance', 'Editar Avance'],
  pnjs: ['Nuevo PNJ', 'Editar PNJ'],
  lugares: ['Nuevo Lugar', 'Editar Lugar'],
  facciones: ['Nueva Facción', 'Editar Facción'],
  lore: ['Nueva Entrada de Lore', 'Editar Lore'],
  items: ['Nuevo Ítem', 'Editar Ítem'],
  mapas: ['Nuevo Mapa', 'Editar Mapa'],
  map_points: ['Nuevo Punto', 'Editar Punto'],
  disponibilidad: ['Nueva disponibilidad', 'Editar disponibilidad'],
  homebrew_rules: ['Nueva Regla Homebrew', 'Editar Regla Homebrew'],
}

const FORM_COMPONENTS = {
  sesiones: SesionForm,
  avances: AvanceForm,
  pjs: PJForm,
  pnjs: PNJForm,
  lugares: LugarForm,
  facciones: FaccionForm,
  lore: LoreForm,
  items: ItemForm,
  mapas: MapaForm,
  map_points: MapPointForm,
  disponibilidad: DisponibilidadForm,
  homebrew_rules: HomeruleForm,
}

export default function FormModal({ form }) {
  const { db, closeForm, activeFieldRef } = useApp()
  const [pickerOpen, setPickerOpen] = useState(false)
  const dialogRef = useRef(null)
  useDialogFocus(dialogRef, FIRST_FIELD)
  const collectionKey = form.type === 'avances' ? 'sesiones' : form.type
  const item = form.id !== null ? (db[collectionKey] || []).find(x => x.id === form.id) ?? null : null
  const FormComponent = FORM_COMPONENTS[form.type]

  // Close request from the backdrop or the X button: confirm before discarding typed data.
  function requestClose() {
    const inputs = dialogRef.current?.querySelectorAll('input, textarea, select') ?? []
    const hasData = [...inputs].some(el => el.value.trim())
    if (!hasData || confirm('¿Descartar cambios?')) closeForm()
  }
  const backdropProps = useBackdropClose(requestClose)
  const isPJForm = form.type === 'pjs'
  const hasWikiLinkFields = form.type !== 'disponibilidad'

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
  let title = titles ? (item ? titles[1] : titles[0]) : ''
  if (form.type === 'disponibilidad' && (item?.tipo ?? form.prefill?.tipo) === 'sesion') {
    title = item ? 'Editar sesión' : 'Nueva sesión'
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/[.82] z-[1000] backdrop-blur-[4px] flex items-center justify-center"
        id="form-overlay"
        {...backdropProps}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={isPJForm ? undefined : 'form-modal-title'}
          aria-label={isPJForm ? 'Ficha de personaje' : undefined}
          tabIndex={-1}
          className="w-[min(640px,92vw)] max-h-[88vh] bg-bg-card border border-border-light overflow-y-auto animate-fade-in outline-none"
        >
          {isPJForm && (
            <div className="sticky top-0 z-[2] h-0 flex justify-end">
              <button
                type="button"
                aria-label="Cerrar"
                className="m-3 cursor-pointer text-txt-muted hover:text-accent-bright transition-colors bg-transparent border-none p-0"
                onClick={requestClose}
              >
                <X size={20} />
              </button>
            </div>
          )}
          {/* Extracted header for all non-PJForm types */}
          {!isPJForm && (
            <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base flex items-center justify-between">
              <span id="form-modal-title">{title}</span>
              <div className="flex items-center gap-3">
                {hasWikiLinkFields && (
                  <button
                    type="button"
                    className={`${btnSecondary} flex items-center gap-1.5`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setPickerOpen(true)}
                  >
                    <Link size={13} />
                    Insertar enlace
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="cursor-pointer text-txt-muted hover:text-accent-bright transition-colors bg-transparent border-none p-0"
                  onClick={requestClose}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          )}
          {FormComponent
            ? <FormComponent item={item} prefill={form.prefill ?? null} openPicker={isPJForm ? () => setPickerOpen(true) : undefined} />
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
