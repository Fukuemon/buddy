import type { BrowserContext, Page } from '@playwright/test'

// 人が字幕を読む時間。画面の状態を待つのではないので、固定の待ちにする
const CAPTION_READ_MS = 1_500
const STEP_KEY = '__e2e-caption-step'

/**
 * 録画の上端に、どのエビデンスか(header)と、いま行っている手順の文を字幕で出す。
 * 手順の文は sessionStorage に置き、画面を読み直しても同じ文を出し続ける。
 * 字幕は pointer-events を持たないので、画面の操作には影響しない。
 */
export const showCaptionInRecording = async (
  context: BrowserContext,
  header: string,
): Promise<void> => {
  await context.addInitScript(
    ({ header, key }) => {
      const install = () => {
        const bar = document.createElement('div')
        bar.id = '__e2e-caption'
        Object.assign(bar.style, {
          position: 'fixed',
          zIndex: '2147483646',
          top: '0',
          left: '0',
          right: '0',
          padding: '6px 16px',
          background: 'rgba(0, 0, 0, 0.72)',
          color: '#fff',
          font: '16px/1.5 sans-serif',
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
          // popover の UA の既定の見た目を消す
          bottom: 'auto',
          margin: '0',
          border: 'none',
          width: 'auto',
          height: 'auto',
          overflow: 'visible',
        })
        const render = () => (bar.textContent = `${header}\n${sessionStorage.getItem(key) ?? ''}`)
        render()
        window.addEventListener('__e2e-caption', render)
        document.body.appendChild(bar)
        raiseOverDialogs(bar)
      }
      // showModal で開いたダイアログは最上位の層に出て、z-index の要素を覆う。字幕を popover にして同じ層に出し、ダイアログが開くたびに出し直して上に重ねる
      const raiseOverDialogs = (el: HTMLElement) => {
        el.popover = 'manual'
        const raise = () => {
          if (!el.isConnected) return
          if (el.matches(':popover-open')) el.hidePopover()
          el.showPopover()
        }
        raise()
        new MutationObserver((records) => {
          if (records.some((r) => r.target instanceof HTMLDialogElement && r.target.open)) raise()
        }).observe(document.documentElement, {
          subtree: true,
          attributes: true,
          attributeFilter: ['open'],
        })
      }
      if (document.body) install()
      else document.addEventListener('DOMContentLoaded', install)
    },
    { header, key: STEP_KEY },
  )
}

/** 字幕の手順の文を変え、人が読めるだけ止める */
export const caption = async (page: Page, text: string): Promise<void> => {
  await page.evaluate(
    ({ text, key }) => {
      sessionStorage.setItem(key, text)
      window.dispatchEvent(new Event('__e2e-caption'))
    },
    { text, key: STEP_KEY },
  )
  await page.waitForTimeout(CAPTION_READ_MS)
}
