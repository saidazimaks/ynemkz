import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // dev: запросы /api идут в локальный FastAPI (VITE_API_URL пустой)
    proxy: { '/api': 'http://localhost:8000' },
  },
})
