import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { findSchedule, listExternalCalendars, previewImport } from '../../fixtures/externalCalendar'
import { createGoogleCalendar, createGoogleEvent } from '../../fixtures/googleCalendar'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaff,
  reinstateStaff,
  retireStaff,
  STAFF_FORM,
} from '../../fixtures/staff'

/** 取り込む期間。走らせるたびに新しい職員のカレンダーを使うので、ほかの spec の予定と重ならない。 */
const RANGE = { start: '2027-03-01', end: '2027-03-31' }

/** 新しい職員を登録し、その職員のカレンダーを calendarpit に作って、職員の ID とカレンダーの ID を返す。 */
const staffWithCalendar = async (request: APIRequestContext, label: string) => {
  const staff = newStaff(label)
  const manager = await issueManagerToken(request)
  const registered = await registerStaff(request, manager, staff)
  expect(registered.status()).toBe(201)
  const { id } = (await registered.json()) as { id: string }
  await createGoogleCalendar(request, staff.email)
  return { id, name: staff.name, calendarId: staff.email }
}

/** カレンダーの連携の画面で、職員 staffId にカレンダー calendarId を結び付ける。 */
const linkCalendar = async (page: Page, staffId: string, calendarId: string) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-open-${staffId}`).click()
  await page.getByTestId('calendar-link-input').fill(calendarId)
  await page.getByTestId('calendar-link-check').click()
  await expect(page.getByTestId('calendar-link-check-result')).toContainText('読めました。')
  await page.getByTestId('calendar-link-submit').click()
  await expect(page.getByTestId(`calendar-link-calendar-id-${staffId}`)).toHaveText(calendarId)
}

/** 予定の取り込みの画面で、職員 staffId の RANGE をプレビューする。 */
const previewRange = async (page: Page, staffId: string) => {
  await page.goto(`/schedule/import?staff=${staffId}`)
  await expect(page.getByTestId('calendar-import-staff')).toHaveValue(staffId)
  await page.getByTestId('calendar-import-start').fill(RANGE.start)
  await page.getByTestId('calendar-import-end').fill(RANGE.end)
  await page.getByTestId('calendar-import-preview').click()
}

test.describe('予定の取り込み', () => {
  test.describe('休職と退職の職員', () => {
    test('休職の職員のカレンダーをプレビューした場合、新しい予定は取り込まない予定に出て、復職すると取り込めること', async ({
      page,
      request,
    }) => {
      const staff = await staffWithCalendar(request, 'leave-calendar')
      const stamp = Date.now()
      const before = `E2E 休職の前 ${stamp}`
      const during = `E2E 休職の間 ${stamp}`
      const manager = await issueManagerToken(request)

      await test.step('休職の前に足した予定を取り込む', async () => {
        await createGoogleEvent(request, staff.calendarId, {
          summary: before,
          date: '2027-03-03',
          start: '10:00',
          end: '11:00',
        })
        await linkCalendar(page, staff.id, staff.calendarId)
        await previewRange(page, staff.id)
        await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
        await page.getByTestId('calendar-import-submit').click()
        await expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件')
      })

      await test.step('休職にした後に足した予定は、休職の職員の新しい予定として取り込まない予定に出る', async () => {
        expect((await leaveStaff(request, manager, staff.id)).status()).toBe(200)
        await createGoogleEvent(request, staff.calendarId, {
          summary: during,
          date: '2027-03-04',
          start: '10:00',
          end: '11:00',
        })
        await previewRange(page, staff.id)

        await expect(page.getByTestId('calendar-import-skipped-heading')).toHaveText(
          '取り込まない予定（1 件）',
        )
        await expect(page.getByTestId('calendar-import-skipped')).toContainText(
          '休職の職員の新しい予定',
        )
        // 取り込む予定が 0 件なので、取り込むの箱は出さない
        await expect(page.getByTestId('calendar-import-count-import')).toBeHidden()
        await expect(page.getByTestId('calendar-import-submit')).toBeDisabled()
        // 休職の職員の新しい予定が残るので、全て取り込み済みの文は出さない
        await expect(page.getByTestId('calendar-import-all-imported')).toBeHidden()
      })

      await test.step('休職の間に足した予定は、プレビューした後も buddy の予定に無い', async () => {
        expect(
          await findSchedule(request, manager, STAFF_FORM.facilityId, {
            date: '2027-03-04',
            title: during,
          }),
        ).toBeUndefined()
      })

      await test.step('復職にすると、結び付け直さずに休職の間に足した予定を取り込める', async () => {
        expect((await reinstateStaff(request, manager, staff.id)).status()).toBe(200)
        await previewRange(page, staff.id)

        await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
        await expect(page.getByTestId('calendar-import-skipped')).toBeHidden()
        await page.getByTestId('calendar-import-submit').click()
        await expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件')
        expect(
          (
            await findSchedule(request, manager, STAFF_FORM.facilityId, {
              date: '2027-03-04',
              title: during,
            })
          )?.staff_id,
        ).toBe(staff.id)
      })
    })

    test('カレンダーを結び付けた職員を退職にした場合、カレンダーが外れ、連携の画面に出ず、取り込めないこと', async ({
      page,
      request,
    }) => {
      const staff = await staffWithCalendar(request, 'retired-calendar')
      const manager = await issueManagerToken(request)
      await linkCalendar(page, staff.id, staff.calendarId)
      const calendar = (await listExternalCalendars(request, manager, STAFF_FORM.facilityId)).find(
        ({ staff_id }) => staff_id === staff.id,
      )
      expect(calendar).toBeDefined()

      expect((await retireStaff(request, manager, staff.id)).status()).toBe(200)
      // 退職の後に Google カレンダーに足した予定は、外れたカレンダーなので、後のプレビューの 404 で取り込めないことを確認する
      await createGoogleEvent(request, staff.calendarId, {
        summary: `E2E 退職の後 ${Date.now()}`,
        date: '2027-03-05',
        start: '10:00',
        end: '11:00',
      })

      await page.goto('/schedule/link')
      await expect(page.getByTestId('calendar-link-service-account')).toBeVisible()
      await expect(page.getByTestId(`calendar-link-row-${staff.id}`)).toHaveCount(0)
      expect(
        (await listExternalCalendars(request, manager, STAFF_FORM.facilityId)).map(
          ({ staff_id }) => staff_id,
        ),
      ).not.toContain(staff.id)
      expect((await previewImport(request, manager, calendar?.id ?? '', RANGE)).status()).toBe(404)
    })
  })
})
