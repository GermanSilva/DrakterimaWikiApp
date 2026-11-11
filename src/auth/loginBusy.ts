import { createContext, useContext } from 'react'

/** Lets the dev email form and the Google button (separate modules) disable each other while one is in flight. */
export interface LoginBusy {
  /** True while the page is handing off to Google. */
  googleBusy: boolean
  /** The dev form reports that a magic link is being sent. */
  setDevBusy: (busy: boolean) => void
}

export const LoginBusyContext = createContext<LoginBusy>({ googleBusy: false, setDevBusy: () => {} })

export const useLoginBusy = () => useContext(LoginBusyContext)
