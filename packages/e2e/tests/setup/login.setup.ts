import { type Page, test as setup } from '@playwright/test'

import { ensureSavedLogin } from '../../kit/auth/index.js'
import {
  BASE_URL,
  LEADER,
  LEADER_STATE,
  LOGIN_NAME,
  LOGIN_STAFF,
  LOGIN_STATE,
} from '../fixtures/env'
import { TIMEOUTS } from '../fixtures/timeouts'
import { signInAtIdp } from '../screens/login'

// 2 つの状態が同じファイルになると、通常の spec もリーダーで流れるので、名前が同じなら止める
if (LOGIN_NAME === LEADER.loginName) {
  throw new Error(`E2E_LOGIN_NAME をリーダーの名前 ${LEADER.loginName} と別にする`)
}

/** /schedule を開き、ヘッダーに staffName が出れば、その職員でログインしているとみなす。 */
const isLoggedInAs = (staffName: string) => async (page: Page) => {
  await page.goto('/schedule')
  if (new URL(page.url()).pathname !== '/schedule') return false
  return page
    .getByTestId('viewer-menu')
    .filter({ hasText: staffName })
    .waitFor({ timeout: TIMEOUTS.expect })
    .then(() => true)
    .catch(() => false)
}

setup('compose の IdP にログインした状態を保存する', async ({ browser }) => {
  await ensureSavedLogin(browser, {
    path: LOGIN_STATE,
    baseUrl: BASE_URL,
    isLoggedIn: isLoggedInAs(LOGIN_STAFF.name),
    login: async (page) => {
      await page.goto('/schedule')
      await signInAtIdp(page, LOGIN_NAME)
    },
  })
})

setup('compose の IdP にチームリーダーでログインした状態を保存する', async ({ browser }) => {
  await ensureSavedLogin(browser, {
    path: LEADER_STATE,
    baseUrl: BASE_URL,
    isLoggedIn: isLoggedInAs(LEADER.staff.name),
    login: async (page) => {
      await page.goto('/schedule')
      await signInAtIdp(page, LEADER.loginName)
    },
  })
})
