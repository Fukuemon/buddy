import { expect, test, type APIRequestContext } from '@playwright/test'

import { LOGIN_STAFF } from '../../fixtures/env'
import { createNormalSchedule, getSchedule } from '../../fixtures/schedule'
import { issueManagerToken, leaveStaff, reinstateStaff, STAFF_FORM } from '../../fixtures/staff'
import { registerNewStaff } from '../../setup/staff'

/** 予定の API で作る予定の日。 */
const SCHEDULE_DATE = '2026-10-20'

/** 有効な職員と止めた職員を 1 人ずつ登録し、それぞれの ID を返す。 */
const registerActiveAndSuspended = async (request: APIRequestContext) => {
  const manager = await issueManagerToken()
  const active = await registerNewStaff(request, manager, 'active')
  const suspended = await registerNewStaff(request, manager, 'hidden')
  expect((await leaveStaff(request, manager, suspended.id)).status()).toBe(200)
  return { active: active.id, suspended: suspended.id }
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

    test('休職の職員を復職にした場合、日の表示にその職員の列が戻ること', async ({
      page,
      request,
    }) => {
      const { suspended } = await registerActiveAndSuspended(request)
      expect((await reinstateStaff(request, await issueManagerToken(), suspended)).status()).toBe(
        200,
      )

      await page.goto('/schedule?view=day')

      await expect(page.getByTestId(`day-grid-staff-${suspended}`)).toBeVisible()
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

test.describe('予定の作成', () => {
  test.describe('止めた職員', () => {
    test('止めた職員がいる事業所で主訪問者の欄を開いた場合、止めた職員が候補に出ないこと', async ({
      page,
      request,
    }) => {
      const { active, suspended } = await registerActiveAndSuspended(request)

      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await page.getByTestId('schedule-field-staff').click()

      // 同じ時に登録した有効な職員が候補に出てから、止めた職員が無いことを確認する
      await expect(page.getByTestId(`staff-select-option-${active}`)).toBeVisible()
      await expect(page.getByTestId(`staff-select-option-${suspended}`)).toHaveCount(0)
    })
  })
})

test.describe('予定の編集', () => {
  test.describe('止めた職員', () => {
    test('止めた職員に割り振った予定を開いた場合、主訪問者の名前が出て、候補に止めた職員が出ないこと', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
      const assigned = await registerNewStaff(request, manager, 'assigned')
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: assigned.id,
        title: `E2E の会議 ${Date.now()}`,
        date: SCHEDULE_DATE,
      })
      expect(created.status()).toBe(201)
      const scheduleId = ((await created.json()) as { id: string }).id
      expect((await leaveStaff(request, manager, assigned.id)).status()).toBe(200)

      await page.goto(`/schedule/${scheduleId}/edit`)

      await expect(page.getByTestId('schedule-field-staff')).toContainText(assigned.name)
      await page.getByTestId('schedule-field-staff').click()
      // 有効な職員が候補に出てから、止めた職員が無いことを確認する
      await expect(page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`)).toBeVisible()
      await expect(page.getByTestId(`staff-select-option-${assigned.id}`)).toHaveCount(0)
    })

    test('止めた職員に割り振った予定のタイトルだけを変えて保存した場合、予定の職員が変わらないこと', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
      const assigned = await registerNewStaff(request, manager, 'kept')
      const stamp = Date.now()
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: assigned.id,
        title: `E2E の会議 ${stamp}`,
        date: SCHEDULE_DATE,
      })
      expect(created.status()).toBe(201)
      const scheduleId = ((await created.json()) as { id: string }).id
      expect((await leaveStaff(request, manager, assigned.id)).status()).toBe(200)
      const changed = `E2E の会議（変更）${stamp}`

      await page.goto(`/schedule/${scheduleId}/edit`)
      await expect(page.getByTestId('schedule-field-staff')).toContainText(assigned.name)
      await page.getByTestId('schedule-field-title').click()
      await page.getByTestId('schedule-form-title').fill(changed)
      await page.getByTestId('schedule-edit-submit').click()

      // 保存が終わると予定の詳細に戻るので、変えたタイトルが出てから API の予定を確認する
      await expect(page.getByTestId('schedule-detail-modal')).toContainText(changed)
      const saved = await getSchedule(request, manager, scheduleId)
      expect(saved.status()).toBe(200)
      expect(await saved.json()).toMatchObject({ title: changed, staff_id: assigned.id })
    })
  })
})
