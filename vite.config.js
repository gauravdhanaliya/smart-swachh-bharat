import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The EcoSetu API (npm run server) runs on :4000 in development.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
