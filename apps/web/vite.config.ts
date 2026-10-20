import { defineConfig, lazyPlugins } from 'vite-plus'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

const isTest = process.env.VITEST === 'true'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() =>
    isTest
      ? [svgr(), viteReact()]
      : [
          devtools({ injectSource: { enabled: false } }),
          tailwindcss(),
          svgr(),
          tanstackStart(),
          viteReact(),
        ],
  ),
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
})

export default config
