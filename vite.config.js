import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    // heavy jsdom suites time out at the 5s default when the full run saturates the machine
    testTimeout: 15000,
    // the default (one worker per core) saturates the machine and makes heavy suites miss their load timeouts
    maxWorkers: 4,
    // integration tests need the local Supabase stack: npm run test:integration
    exclude: [...configDefaults.exclude, 'src/data/integration/**'],
  },
})
