import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { FAKE_GOOGLE_URL, SATO } from '../../fixtures/env'

type FakeEvent = {
  id: string
  summary?: string
  status?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
}

/** 偽物の Google の、佐藤のカレンダーの予定のうち、題名が summary のものを返す。 */
const findEvent = async (request: APIRequestContext, summary: string) => {
  const res = await request.get(
    `${FAKE_GOOGLE_URL}/calendars/${encodeURIComponent(SATO.calendarId)}/events`,
  )
  const { items = [] } = (await res.json()) as { items?: FakeEvent[] }
  return items.find((event) => event.summary === summary)
}

/** 偽物の Google の画面の操作と同じく、予定を 1 時間遅らせて etag を変える。 */
const shiftInGoogle = async (request: APIRequestContext, eventId: string) => {
  const res = await request.post(`${FAKE_GOOGLE_URL}/view/shift`, {
    form: { calendar: SATO.calendarId, event: eventId },
    maxRedirects: 0,
  })
  expect(res.status()).toBe(303)
}

/** 偽物の Google が、変わった予定を予定の API に渡すかを変える。 */
const holdChanges = async (request: APIRequestContext, hold: boolean) => {
  const res = await request.post(`${FAKE_GOOGLE_URL}/view/hold`, {
    form: { calendar: SATO.calendarId, hold: String(hold) },
    maxRedirects: 0,
  })
  expect(res.status()).toBe(303)
}

/** 偽物の Google の予定の日時を、予定の詳細の日時の形（2026-10-22 10:00 - 11:00）にする。 */
const detailDateTime = (event: FakeEvent | undefined) => {
  const start = event?.start?.dateTime ?? ''
  const end = event?.end?.dateTime ?? ''
  return `${start.slice(0, 10)} ${start.slice(11, 16)} - ${end.slice(11, 16)}`
}

/** 日の表示で、佐藤の予定のうち題名が title のものを開く。 */
const openSchedule = async (page: Page, title: string) => {
  await page.goto('/schedule?view=day')
  await page
    .getByTestId(`day-grid-staff-${SATO.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
    .click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

test.describe('確かめが要る予定', () => {
  test.describe('Google カレンダーとの同期', () => {
    // 途中で落ちても、後の spec が Google の変更を受け取れ、やり直しで佐藤にもう一度結び付けられるようにする
    test.afterEach(async ({ page, request }) => {
      await holdChanges(request, false)
      await page.goto('/schedule/link')
      const remove = page.getByTestId(`calendar-link-remove-${SATO.id}`)
      await expect(page.getByTestId(`calendar-link-row-${SATO.id}`)).toBeVisible()
      if (await remove.isVisible()) {
        await remove.click()
        await page.getByTestId('calendar-unlink-submit').click()
        await expect(remove).toBeHidden()
      }
    })

    test('Google カレンダーで直した予定が buddy に出て、両方で変わった予定は Google の内容に合わせられること', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const created = `E2E の同期 ${stamp}`
      const changed = `E2E の同期（buddy で変更）${stamp}`
      let eventId = ''

      await test.step('佐藤に Google カレンダーを結び付け、buddy で作った予定を Google カレンダーに出す', async () => {
        await page.goto('/schedule/link')
        await page.getByTestId(`calendar-link-open-${SATO.id}`).click()
        await expect(page.getByTestId('calendar-link-input')).toHaveValue(SATO.calendarId)
        await page.getByTestId('calendar-link-check').click()
        await expect(page.getByTestId('calendar-link-check-result')).toContainText('読めました。')
        await page.getByTestId('calendar-link-submit').click()
        await expect(page.getByTestId(`calendar-link-calendar-id-${SATO.id}`)).toHaveText(
          SATO.calendarId,
        )

        await page.goto('/schedule?view=day')
        await expect(page.getByTestId(`day-grid-staff-${SATO.id}`)).toBeVisible()
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-normal').check()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(created)
        await page.getByTestId('schedule-field-staff').click()
        await page.getByTestId(`staff-select-option-${SATO.id}`).check()
        await page.getByTestId('schedule-create-submit').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()

        await expect.poll(async () => (await findEvent(request, created))?.status).toBe('confirmed')
        eventId = (await findEvent(request, created))?.id ?? ''
      })

      await test.step('職員が Google カレンダーで予定を遅らせると、buddy の予定も遅れる', async () => {
        await shiftInGoogle(request, eventId)
        const shifted = detailDateTime(await findEvent(request, created))

        // 予定の API が数秒ごとに Google の変更を読むので、出るまで開き直す
        await expect(async () => {
          await openSchedule(page, created)
          await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(shifted)
        }).toPass()
      })

      await test.step('buddy と Google カレンダーの両方で変えると、確かめが要る予定に出る', async () => {
        await holdChanges(request, true)
        await shiftInGoogle(request, eventId)
        await openSchedule(page, created)
        await page.getByTestId('schedule-detail-edit').click()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(changed)
        await page.getByTestId('schedule-edit-submit').click()
        await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()

        await page.goto('/schedule/review')
        const row = page.getByTestId(/^calendar-review-row-/).filter({ hasText: SATO.name })
        await expect(async () => {
          await page.reload()
          await expect(row).toBeVisible()
        }).toPass()
        await expect(row.getByTestId(/^calendar-review-reason-/)).toHaveText(
          'buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。',
        )
        await holdChanges(request, false)
      })

      await test.step('Google の内容に合わせると、一覧から消え、buddy の予定が Google カレンダーの題名と日時になる', async () => {
        await page
          .getByTestId(/^calendar-review-row-/)
          .filter({ hasText: SATO.name })
          .getByTestId(/^calendar-review-accept-/)
          .click()
        const dialog = page.getByTestId('calendar-accept-dialog')
        await expect(dialog).toContainText('buddy で変えた題名と日時は消えます。')
        await page.getByTestId('calendar-accept-submit').click()
        await expect(dialog).toBeHidden()
        await expect(
          page.getByTestId(/^calendar-review-row-/).filter({ hasText: SATO.name }),
        ).toHaveCount(0)

        const google = await findEvent(request, created)
        expect(google?.id).toBe(eventId)
        await openSchedule(page, created)
        await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
          detailDateTime(google),
        )
        await expect(page.getByTestId('schedule-detail-modal')).not.toContainText(changed)
      })
    })
  })
})
