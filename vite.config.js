import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/DrakterimaWikiApp/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    // integration tests need the local Supabase stack: npm run test:integration
    exclude: [...configDefaults.exclude, 'src/data/integration/**'],
  },
})
