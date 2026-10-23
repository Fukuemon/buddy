import { expect, test, type APIRequestContext } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { newStaff, registerStaff, suspendStaff } from '../../fixtures/staff'

/** 有効な職員と止めた職員を 1 人ずつ登録し、それぞれの ID を返す。 */
const registerActiveAndSuspended = async (request: APIRequestContext) => {
  const manager = await issueAccessToken(request, LOGIN_EMAIL)
  const register = async (label: string) => {
    const registered = await registerStaff(request, manager, newStaff(label))
    expect(registered.status()).toBe(201)
    return ((await registered.json()) as { id: string }).id
  }
  const active = await register('active')
  const suspended = await register('hidden')
  expect((await suspendStaff(request, manager, suspended)).status()).toBe(200)
  return { active, suspended }
}

test.describe('予定のカレンダー', () => {
  test.describe('止めた職員', () => {
    test('止めた職員がいる事業所で日の表示を開いた場合、止めた職員の列が出ないこと', async ({
      page,
      request,
    }) => {
      const { active, suspended } = await registerActiveAndSuspended(request)

      await page.goto('/schedule?view=day')

      // 同じ時に登録した有効な職員の列が出てから、止めた職員の列が無いことを確認する
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await expect(page.getByTestId(`day-grid-staff-${active}`)).toBeVisible()
      await expect(page.getByTestId(`day-grid-staff-${suspended}`)).toHaveCount(0)
    })

    test('止めた職員がいる事業所で職員の絞り込みを見た場合、止めた職員が候補に出ないこと', async ({
      page,
      request,
    }) => {
      const { active, suspended } = await registerActiveAndSuspended(request)

      await page.goto('/schedule')

      // 同じ時に登録した有効な職員が候補に出てから、止めた職員が無いことを確認する
      const sidebar = page.getByTestId('staff-filter-sidebar')
      await expect(sidebar.getByTestId(`staff-filter-staff-${active}`)).toBeVisible()
      await expect(sidebar.getByTestId(`staff-filter-staff-${suspended}`)).toHaveCount(0)
    })
  })
})
