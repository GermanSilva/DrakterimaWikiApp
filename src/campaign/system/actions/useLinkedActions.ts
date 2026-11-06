import { useCallback, useEffect, useState } from 'react'
import type { ActionCollectionRepository, LinkedAction } from '../../../data'
import { onLinksChanged } from './linkEvents'

/**
 * The collection entries one character links, with its state (S36). Read once per `version` of the character and again after
 * every link change announced for it; no `actions` (or `enabled` false) reads nothing. A failed read keeps what was shown and sets `error`.
 */
export function useLinkedActions(actions: ActionCollectionRepository | null, pjId: number, enabled: boolean, version: unknown = null) {
  const [linked, setLinked] = useState<LinkedAction[]>([])
  const [error, setError] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled || !actions) return
    try {
      setLinked(await actions.listLinkedActions(pjId))
      setError(false)
    } catch (err) {
      console.error('No se pudieron leer las acciones del personaje', err)
      setError(true)
    }
  }, [actions, pjId, enabled])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload, version])

  useEffect(() => onLinksChanged((changed) => changed === pjId && void reload()), [pjId, reload])

  const active = enabled && actions !== null
  return { linked: active ? linked : [], error: active && error, reload }
}
