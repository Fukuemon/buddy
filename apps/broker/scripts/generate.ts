/**
 * ID ブローカーの画面のテンプレートと CSS を、services/broker/internal/login/pages/ に書き出す（ADR-0027）。
 * テンプレートは src/pages.tsx を React で静的な HTML にしたもので、CSS は src/pages.css を Tailwind で生成して圧縮したものである。
 * ID ブローカーは、書き出したファイルを go:embed で読む。pnpm check:generated が、コミットした生成物と食い違っていないかを確認する。
 *
 * 使い方: pnpm --filter @buddy/broker generate
 * 終了コード: 書けたら 0。描画か CSS の生成に失敗したら 1。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { transform } from 'lightningcss'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, '../../services/broker/internal/login/pages')

const cssHeader =
  '/* 生成物。手で直さない。apps/broker の pnpm generate が src/pages.css から作る。 */\n'

const server = await createServer({
  root,
  configFile: false,
  plugins: [tailwindcss()],
  appType: 'custom',
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false },
})
try {
  const { renderPages } = (await server.ssrLoadModule('/src/pages.tsx')) as {
    renderPages: () => Record<string, string>
  }
  const { default: css } = (await server.ssrLoadModule('/src/pages.css?inline')) as {
    default: string
  }
  const { code } = transform({ filename: 'pages.css', code: Buffer.from(css), minify: true })

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  for (const [name, html] of Object.entries(renderPages())) {
    writeFileSync(join(out, name), html)
  }
  writeFileSync(join(out, 'pages.css'), `${cssHeader}${code.toString()}\n`)
} finally {
  await server.close()
}
