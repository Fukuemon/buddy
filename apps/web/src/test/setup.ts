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

// handler の無い要求はテストの誤りなので、素通しせずに失敗させる
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
