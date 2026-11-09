import { defineConfig, lazyPlugins } from 'vite-plus'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

const isTest = process.env.VITEST === 'true'
if (isTest) {
  // 日時の変換のテストの期待値を、実行する環境の時間帯に依らず +09:00 で書けるようにする。
  process.env.TZ = 'Asia/Tokyo'
}

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
    // 既定の CPU の数より 1 少ないワーカーでは、ほかの処理と並べて流したときに CPU が足りず、findBy の待ちを超えて落ちる（#894）
    maxWorkers: '50%',
  },
})

export default config
