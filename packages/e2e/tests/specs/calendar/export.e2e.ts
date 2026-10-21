import { expect, test, type APIRequestContext } from '@playwright/test'

import { FAKE_GOOGLE_URL, HAYASHI } from '../../fixtures/env'

type FakeEvent = { id: string; summary?: string; status?: string }

/** 偽物の Google の、林のカレンダーの予定のうち、題名が summary のものを返す。 */
const findEvent = async (request: APIRequestContext, summary: string) => {
  const res = await request.get(
    `${FAKE_GOOGLE_URL}/calendars/${encodeURIComponent(HAYASHI.calendarId)}/events`,
  )
  const { items = [] } = (await res.json()) as { items?: FakeEvent[] }
  return items.find((event) => event.summary === summary)
}

test.describe('確かめが要る予定', () => {
  test.describe('Google カレンダーへの書き出し', () => {
    test('Google カレンダーで直された予定を buddy で変えた場合、確かめが要る予定に出て、書き直すと Google カレンダーが buddy の内容になること', async ({
      page,
      request,
    }) => {
      // 林にカレンダーを結び付けたまま残すので、同じ DB で 2 回目を流すと落ちる。流し直すときは DB を作り直す
      const stamp = Date.now()
      const created = `E2E の書き出し ${stamp}`
      const changed = `E2E の書き出し（buddy で変更）${stamp}`
      let eventId = ''

      await test.step('林に Google カレンダーを結び付ける', async () => {
        await page.goto('/schedule/link')
        await page.getByTestId(`calendar-link-open-${HAYASHI.id}`).click()
        await expect(page.getByTestId('calendar-link-input')).toHaveValue(HAYASHI.calendarId)
        await page.getByTestId('calendar-link-check').click()
        await expect(page.getByTestId('calendar-link-check-result')).toContainText('読めました。')
        await page.getByTestId('calendar-link-submit').click()
        await expect(page.getByTestId(`calendar-link-calendar-id-${HAYASHI.id}`)).toHaveText(
          HAYASHI.calendarId,
        )
      })

      await test.step('buddy で林の予定を作ると、林の Google カレンダーに同じ題名で出る', async () => {
        await page.goto('/schedule?view=day')
        await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-normal').check()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(created)
        await page.getByTestId('schedule-field-staff').click()
        await page.getByTestId(`staff-select-option-${HAYASHI.id}`).check()
        await page.getByTestId('schedule-create-submit').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()

        await expect.poll(async () => (await findEvent(request, created))?.status).toBe('confirmed')
        eventId = (await findEvent(request, created))?.id ?? ''
      })

      await test.step('職員が Google カレンダーで予定を直した後に buddy で変えると、確かめが要る予定に出る', async () => {
        // 偽物の Google の画面の操作と同じく、時刻を 1 時間遅らせて etag を変える
        const shifted = await request.post(`${FAKE_GOOGLE_URL}/view/shift`, {
          form: { calendar: HAYASHI.calendarId, event: eventId },
          maxRedirects: 0,
        })
        expect(shifted.status()).toBe(303)

        await page
          .getByTestId(`day-grid-staff-${HAYASHI.id}`)
          .getByTestId(/^schedule-event-/)
          .filter({ hasText: created })
          .click()
        await page.getByTestId('schedule-detail-edit').click()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(changed)
        await page.getByTestId('schedule-edit-submit').click()
        await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()

        await page.goto('/schedule/review')
        const row = page.getByTestId(/^calendar-review-row-/).filter({ hasText: HAYASHI.name })
        // 書き出しの処理が 412 を受けるまでは一覧に出ないので、出るまで読み直す
        await expect(async () => {
          await page.reload()
          await expect(row).toBeVisible()
        }).toPass()
        await expect(row.getByTestId(/^calendar-review-reason-/)).toHaveText(
          'Google カレンダーで予定が直されたので、buddy の変更を書き出していません。',
        )
        // 一覧は Google カレンダーの題名を出さない
        await expect(page.getByTestId('calendar-review-table')).not.toContainText(created)
        await expect(page.getByTestId('calendar-review-table')).not.toContainText(changed)
        expect((await findEvent(request, created))?.status).toBe('confirmed')
      })

      await test.step('buddy の内容で書き直すと、一覧から消え、Google カレンダーが buddy の題名になる', async () => {
        await page
          .getByTestId(/^calendar-review-row-/)
          .filter({ hasText: HAYASHI.name })
          .getByTestId(/^calendar-review-rewrite-/)
          .click()
        const dialog = page.getByTestId('calendar-rewrite-dialog')
        await expect(dialog).toContainText('Google カレンダーで直した題名と日時は消えます。')
        await page.getByTestId('calendar-rewrite-submit').click()
        await expect(dialog).toBeHidden()
        await expect(
          page.getByTestId(/^calendar-review-row-/).filter({ hasText: HAYASHI.name }),
        ).toHaveCount(0)

        await expect.poll(async () => (await findEvent(request, changed))?.id).toBe(eventId)
      })
    })
  })
})
