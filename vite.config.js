import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The EcoSetu API (npm run server) runs on :4000 in development.
    // The browser's Host/Origin are passed through (changeOrigin: false, and
    // X-Forwarded-Host) so the API sees the app and the API as one site, which
    // keeps the refresh-token cookie same-site in development.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false, xfwd: true },
    },
  },
})
