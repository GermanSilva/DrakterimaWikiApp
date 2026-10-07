import { defineConfig } from 'vitest/config'

// Opt-in: `npm run test:integration` (needs the local Supabase stack: `supabase start`).
export default defineConfig({
  esbuild: { jsx: 'automatic' }, // the h7a test renders React hooks/components without the react plugin
  test: {
    environment: 'node',
    globals: true,
    include: ['src/data/integration/**/*.integration.test.{ts,tsx}'],
    globalSetup: ['src/data/integration/globalSetup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
