import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Frontend tests (Vitest + React Testing Library). The API and adapter tests
// in server/test and tests/ use node:test and run with `npm run test:node`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
})
