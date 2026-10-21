import { type Page, test as setup } from '@playwright/test'

import { ensureSavedLogin } from '../../kit/auth/index.js'
import { BASE_URL, LEADER, LEADER_STATE, LOGIN_NAME, LOGIN_STATE } from '../fixtures/env'
import { TIMEOUTS } from '../fixtures/timeouts'
import { signInAtIdp } from '../screens/login'

const isLoggedIn = async (page: Page) => {
  await page.goto('/schedule')
  if (new URL(page.url()).pathname !== '/schedule') return false
  return page
    .getByTestId('viewer-menu')
    .waitFor({ timeout: TIMEOUTS.expect })
    .then(() => true)
    .catch(() => false)
}

setup('compose の IdP にログインした状態を保存する', async ({ browser }) => {
  await ensureSavedLogin(browser, {
    path: LOGIN_STATE,
    baseUrl: BASE_URL,
    isLoggedIn,
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
    isLoggedIn,
    login: async (page) => {
      await page.goto('/schedule')
      await signInAtIdp(page, LEADER.loginName)
    },
  })
})
