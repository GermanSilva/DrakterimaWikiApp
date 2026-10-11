import { useState } from 'react'
import { suggestSlug } from './campaignSlug'

/** Name + address pair shared by the create and request forms: the address follows the name until it is edited by hand. */
export function useNameAndSlug() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  return {
    name,
    slug,
    changeName(value: string) {
      setName(value)
      if (!slugTouched) setSlug(suggestSlug(value))
    },
    changeSlug(value: string) {
      setSlugTouched(true)
      setSlug(value)
    },
    reset() {
      setName('')
      setSlug('')
      setSlugTouched(false)
    },
  }
}
