import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  plugins: [tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
