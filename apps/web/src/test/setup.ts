import '@testing-library/jest-dom/vitest'
import { setProjectAnnotations } from '@storybook/react-vite'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vite-plus/test'

import preview from '../../.storybook/preview'

setProjectAnnotations(preview)

// jsdom は <dialog> の showModal と close を持たない（jsdom/jsdom#3294）。開閉の属性だけを切り替える。
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

afterEach(() => {
  cleanup()
})
