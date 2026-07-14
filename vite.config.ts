import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves from /Racetrack_maker/ when GITHUB_PAGES=true
const base =
  process.env.GITHUB_PAGES === 'true' ? '/Racetrack_maker/' : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
