import { test as setup } from '@playwright/test'

import { ensureSavedLogin } from '../../kit/auth/index.js'
import { BASE_URL, LOGIN_NAME, LOGIN_STATE } from '../fixtures/env'
import { signInAtIdp } from '../screens/login'

setup('compose の IdP にログインした状態を保存する', async ({ browser }) => {
  await ensureSavedLogin(browser, {
    path: LOGIN_STATE,
    baseUrl: BASE_URL,
    isLoggedIn: async (page) => {
      await page.goto('/schedule')
      return new URL(page.url()).pathname === '/schedule'
    },
    login: async (page) => {
      await page.goto('/schedule')
      await signInAtIdp(page, LOGIN_NAME)
    },
  })
})
