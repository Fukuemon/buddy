import type { Page } from '@playwright/test'

import { apiClient } from '../../../selectors/apiReference'
import { waitForFieldValue, waitForResponseLine } from '../waits/apiClient'

/** レスポンスの本文を 1 回に送る量（px） */
const RESPONSE_SCROLL_STEP = 200

/**
 * クライアントの認証の欄に、トークンを伏せ字のまま入れる。
 * 欄は input の要素なので、fill が値を入れ終えてから返る。伏せ字の欄は値を文字で出さないので、ほかの欄と違い、出た文字では待たない。
 */
export const fillApiToken = async (page: Page, token: string) => {
  await apiClient(page).token.fill(token)
}

/** パスの引数に、例に無い値を「Add value」で足して選ぶ。 */
export const fillApiVariable = async (page: Page, name: string, value: string) => {
  const client = apiClient(page)
  await client.variableValue(name).click()
  await client.addValue.click()
  // 「Add value」の欄は、前に選んだ値を持って開くことがあるので、消してから打つ
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
  await waitForFieldValue(client.variableValue(name), value)
}

/** クエリの引数に値を入れる。 */
export const fillApiQuery = async (page: Page, name: string, value: string) => {
  const field = apiClient(page).queryValue(name)
  await field.click()
  await page.keyboard.type(value)
  await waitForFieldValue(field, value)
}

/** 本文の JSON を、例から body に入れ替え、本文の欄が入れた JSON の 2 行目を出すまで待つ。 */
export const fillApiBody = async (page: Page, body: unknown) => {
  const client = apiClient(page)
  const json = JSON.stringify(body, null, 2)
  await client.body.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(json)
  // 1 行目の「{」は例の本文にもあるので、入れ替わったことが分かる 2 行目で待つ
  await waitForFieldValue(client.body, json.split('\n')[1]?.trim() ?? json)
}

/**
 * レスポンスの本文を、text を含む行が描かれるまでスクロールし、その行を画面に出す。
 * 本文は見えている行だけを描くので、長いレスポンスの後ろの行は、スクロールするまで DOM に無い。
 * ブラウザの中で、本文が text を描くまで、本文をスクロールする要素を 2 フレームごとに送る。描いた時点で止めるので、行を送り過ごさない。
 * 送るのは maxScrolls 回までで、それでも描かれなければ、行の待ちが操作のタイムアウトで失敗する。
 */
export const scrollApiResponseTo = async (page: Page, text: string, maxScrolls = 60) => {
  const { response, responseLine } = apiClient(page)
  const line = responseLine(text)
  await response.hover()
  await response.evaluate(
    async (element, o) => {
      const scrollable = (node: HTMLElement) => {
        const { overflowY } = getComputedStyle(node)
        return /(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight
      }
      let scroller: HTMLElement | null = element as HTMLElement
      while (scroller && !scrollable(scroller)) scroller = scroller.parentElement
      if (!scroller) return
      for (let i = 0; i < o.maxScrolls && !(element.textContent ?? '').includes(o.text); i++) {
        scroller.scrollTop += o.step
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }
    },
    { text, maxScrolls, step: RESPONSE_SCROLL_STEP },
  )
  await waitForResponseLine(line)
  await line.scrollIntoViewIfNeeded()
}
