import { createContext, useContext } from 'react'
import type { HubData } from './hubData'

export const DataContext = createContext<HubData | null>(null)

export function useHubData(): HubData {
  const value = useContext(DataContext)
  if (!value) throw new Error('useHubData must be used inside <HubDataProvider>')
  return value
}
