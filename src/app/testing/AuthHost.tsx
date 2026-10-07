import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthValue } from '../../auth/AuthContext'

/** Test-only auth provider whose value a test can replace (e.g. signOut flipping the status). */
export function AuthHost({
  initial,
  onReady,
  children,
}: {
  initial: AuthValue
  onReady: (set: (next: AuthValue) => void) => void
  children: ReactNode
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    onReady(setValue)
  }, [onReady])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
