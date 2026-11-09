import '@testing-library/jest-dom/vitest'
import { setProjectAnnotations } from '@storybook/react-vite'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vite-plus/test'

import preview from '../../.storybook/preview'

import { server } from './server'

setProjectAnnotations(preview)

// jsdom は <dialog> の showModal と close を持たない（https://github.com/jsdom/jsdom/issues/3294）。開閉の属性だけを切り替える。
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true
    },
    close(this: HTMLDialogElement) {
      this.open = false
    },
  })
}

// jsdom はデフォルトのスタイルシートを、テストのファイルごとに、最初に計算済みのスタイルを求めたときに解析する。
// モーダルを開いたときの focus でこの解析が走ると、負荷の高い端末では最初のテストの findBy の待ちを超えるので、先に解析させる（#965）
if (typeof document !== 'undefined') {
  getComputedStyle(document.body).getPropertyValue('display')
}

// handler の無いリクエストはテストの不備なので、素通しせずに失敗させる
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
