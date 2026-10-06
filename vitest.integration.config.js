import { defineConfig } from 'vitest/config'

// Opt-in: `npm run test:integration` (needs the local Supabase stack: `supabase start`).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/data/integration/**/*.integration.test.ts'],
    globalSetup: ['src/data/integration/globalSetup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
