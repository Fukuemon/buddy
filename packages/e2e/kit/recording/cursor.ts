import type { BrowserContext } from '@playwright/test'

const COLOR = {
  up: { css: 'rgba(255, 64, 64, 0.6)', name: '赤い' },
  down: { css: 'rgba(255, 200, 0, 0.9)', name: '黄色の' },
}

/** 録画を見る人へのカーソルの凡例 */
export const CURSOR_LEGEND = `カーソル: ${COLOR.up.name}丸はマウスの位置、${COLOR.down.name}丸はボタンを押している間`

/**
 * 録画にマウスのカーソルが映らないので、カーソルの位置に丸を描き、押している間は色を変える。
 * 丸は pointer-events を持たないので、画面の操作には影響しない。
 */
export const showCursorInRecording = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(
    ({ up, down }) => {
      const install = () => {
        const dot = document.createElement('div')
        dot.id = '__e2e-cursor'
        Object.assign(dot.style, {
          position: 'fixed',
          zIndex: '2147483647',
          width: '18px',
          height: '18px',
          margin: '-9px 0 0 -9px',
          borderRadius: '50%',
          border: '2px solid #fff',
          background: up,
          pointerEvents: 'none',
          left: '-100px',
          top: '-100px',
        })
        document.body.appendChild(dot)
        const opts = { capture: true, passive: true }
        window.addEventListener(
          'mousemove',
          (e) => Object.assign(dot.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }),
          opts,
        )
        window.addEventListener('mousedown', () => (dot.style.background = down), opts)
        window.addEventListener('mouseup', () => (dot.style.background = up), opts)
      }
      if (document.body) install()
      else document.addEventListener('DOMContentLoaded', install)
    },
    { up: COLOR.up.css, down: COLOR.down.css },
  )
}
