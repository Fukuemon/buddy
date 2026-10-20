import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), svgr(), viteReact()],
})
