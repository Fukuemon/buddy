import { expect, test as setup } from '@playwright/test'

import {
  HAYASHI,
  HAYASHI_STATE,
  ISHIDA,
  ISHIDA_STATE,
  LEADER,
  LEADER_STATE,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OFFICE_B,
  OFFICE_B_STATE,
  OFFICE_CLERK,
  OFFICE_CLERK_STATE,
  OKADA,
  OKADA_STATE,
} from '../fixtures/env'
import { signInAtBroker } from '../screens/login'

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
  {
    title:
      'compose のブローカーに Google カレンダーを正本にする事業所の職員でログインした状態を保存する',
    path: OKADA_STATE,
    email: OKADA.email,
    staffName: OKADA.staff.name,
  },
  {
    title:
      'compose のブローカーに予定の正本の切り替えを確認する事業所の職員でログインした状態を保存する',
    path: ISHIDA_STATE,
    email: ISHIDA.email,
    staffName: ISHIDA.staff.name,
  },
  {
    title: 'compose のブローカーにメンバーでログインした状態を保存する',
    path: HAYASHI_STATE,
    email: HAYASHI.email,
    staffName: HAYASHI.name,
  },
  {
    title: 'compose のブローカーに 2 つ目の事業所の職員でログインした状態を保存する',
    path: OFFICE_B_STATE,
    email: OFFICE_B.email,
    staffName: OFFICE_B.staff.name,
  },
  {
    title: 'compose のブローカーに訪問しない事務の職員でログインした状態を保存する',
    path: OFFICE_CLERK_STATE,
    email: OFFICE_CLERK.email,
    staffName: OFFICE_CLERK.name,
  },
]

// 流すたびにログインし直して保存する。保存した状態を使い回すかの判定を持たない
for (const { title, path, email, staffName } of ACCOUNTS) {
  setup(title, async ({ page }) => {
    await page.goto('/schedule')
    await signInAtBroker(page, email)
    await expect(page.getByTestId('viewer-menu')).toContainText(staffName)
    await page.context().storageState({ path })
  })
}
