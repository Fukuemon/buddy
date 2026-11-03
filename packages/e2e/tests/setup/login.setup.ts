import { type Page, test as setup } from '@playwright/test'

import { ensureSavedLogin } from '@fukuemon/e2e-kit/auth'
import {
  BASE_URL,
  LEADER,
  LEADER_STATE,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
} from '../fixtures/env'
import { TIMEOUT_MS } from '../fixtures/timeouts'
import { signInAtBroker } from '../screens/login'

/** /schedule を開き、ヘッダーに staffName が出れば、その職員でログインしているとみなす。 */
const isLoggedInAs = (staffName: string) => async (page: Page) => {
  await page.goto('/schedule')
  if (new URL(page.url()).pathname !== '/schedule') return false
  return page
    .getByTestId('viewer-menu')
    .filter({ hasText: staffName })
    .waitFor({ timeout: TIMEOUT_MS.expect })
    .then(() => true)
    .catch(() => false)
}

const ACCOUNTS = [
  {
    title: 'compose のブローカーにログインした状態を保存する',
    path: LOGIN_STATE,
    email: LOGIN_EMAIL,
    staffName: LOGIN_STAFF.name,
  },
  {
    title: 'compose のブローカーにチームリーダーでログインした状態を保存する',
    path: LEADER_STATE,
    email: LEADER.email,
    staffName: LEADER.staff.name,
  },
]

for (const { title, path, email, staffName } of ACCOUNTS) {
  setup(title, async ({ browser }) => {
    await ensureSavedLogin(browser, {
      path,
      baseUrl: BASE_URL,
      isLoggedIn: isLoggedInAs(staffName),
      login: async (page) => {
        await page.goto('/schedule')
        await signInAtBroker(page, email)
      },
    })
  })
}
