import { waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { renderSection } from '../testing/renderSection'

describe('presence beacon mount', () => {
  it.each([
    ['the DM', true],
    ['a player', false],
  ])('records the last connection of %s when a campaign section opens', async (_who, isDM) => {
    const { layer, spies } = createFakeLayer()
    renderSection('/c/demo/homerules', { layer, isDM })
    await waitFor(() => expect(spies.presenceTouch).toHaveBeenCalledWith('c1'))
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
  })
})
