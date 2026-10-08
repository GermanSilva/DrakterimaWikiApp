import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// waitFor/findBy default to 1s; lazy chunks resolve slower when the full suite saturates the machine
configure({ asyncUtilTimeout: 5000 })
