import { useMemo, type ReactNode } from 'react'
import { DataContext } from './DataContext'
import { createHubData, type HubData } from './hubData'

export interface HubDataProviderProps {
  children: ReactNode
  /** Tests inject a fake; production builds it lazily from the shared client. */
  data?: HubData
}

export function HubDataProvider({ children, data }: HubDataProviderProps) {
  const value = useMemo(() => data ?? createHubData(), [data])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
