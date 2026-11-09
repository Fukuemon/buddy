import type { Page } from '@playwright/test'

import { apiClient } from '../../../selectors/apiReference'
import { waitForFieldValue, waitForResponseLine } from '../waits/apiClient'

/** レスポンスの本文を 1 回に送る量（px） */
const RESPONSE_SCROLL_STEP = 200

/** クライアントの認証の欄に、トークンを伏せ字のまま入れる。 */
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

/** 本文の JSON を、例から body に入れ替える。 */
export const fillApiBody = async (page: Page, body: unknown) => {
  const client = apiClient(page)
  await client.body.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(JSON.stringify(body, null, 2))
}

/**
 * レスポンスの本文を、text を含む行が描かれるまでスクロールし、その行を画面に出す。
 * 本文は見えている行だけを描くので、長いレスポンスの後ろの行は、スクロールするまで DOM に無い。
 * 行が描かれるのを待ちながら送り、maxScrolls 回送っても描かれなければ、Playwright のタイムアウトで失敗する。
 */
export const scrollApiResponseTo = async (page: Page, text: string, maxScrolls = 60) => {
  const { response, responseLine } = apiClient(page)
  const line = responseLine(text)
  await response.hover()
  let drawn = false
  const appeared = waitForResponseLine(line).finally(() => {
    drawn = true
  })
  // 待ちが先に失敗しても、ループを抜けて下の await で失敗を返すまで、未処理の失敗にしない
  appeared.catch(() => undefined)
  for (let i = 0; i < maxScrolls && !drawn; i++) {
    await page.mouse.wheel(0, RESPONSE_SCROLL_STEP)
  }
  await appeared
  await line.scrollIntoViewIfNeeded()
}
