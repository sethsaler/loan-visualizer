import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// GitHub Pages project site: https://sethsaler.github.io/loan-visualizer/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/loan-visualizer/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
}))
