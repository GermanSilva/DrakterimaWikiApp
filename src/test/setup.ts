import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// waitFor/findBy default to 1s. With 12 workers the first render of a file measured 5.2-5.4 s (just over 5 s); 10 s stays under the 15 s testTimeout
configure({ asyncUtilTimeout: 10000 })
