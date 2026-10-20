import { test as setup } from '@playwright/test'

import { ensureSavedLogin } from '../../kit/auth/index.js'
import { BASE_URL, LOGIN_NAME, LOGIN_STATE } from '../fixtures/env'
import { TIMEOUTS } from '../fixtures/timeouts'
import { signInAtIdp } from '../screens/login'

setup('compose の IdP にログインした状態を保存する', async ({ browser }) => {
  await ensureSavedLogin(browser, {
    path: LOGIN_STATE,
    baseUrl: BASE_URL,
    isLoggedIn: async (page) => {
      await page.goto('/schedule')
      if (new URL(page.url()).pathname !== '/schedule') return false
      return page
        .getByTestId('viewer-menu')
        .waitFor({ timeout: TIMEOUTS.expect })
        .then(() => true)
        .catch(() => false)
    },
    login: async (page) => {
      await page.goto('/schedule')
      await signInAtIdp(page, LOGIN_NAME)
    },
  })
})
