import { expect, test, type Browser, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { createGoogleCalendar, createGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaff,
  reinstateStaff,
  retireStaff,
} from '../../fixtures/staff'
import { linkStaffCalendar } from '../../setup/calendar'

/** 取り込む期間。撮るたびに新しい職員のカレンダーを使うので、ほかの撮影の予定と重ならない。 */
const RANGE = { start: '2027-03-01', end: '2027-03-31' }

type StaffWithCalendar = { id: string; name: string; token: string }

/**
 * 録画の外で、新しい職員を登録し、その職員のカレンダーに 2027-03-04 の予定を 1 件足して、カレンダーを結び付ける。
 * カレンダーの ID は職員のメールで、カレンダーの連携の画面の入力の初期値になる。after は、結び付けた後に職員の状態を変える前準備である。
 */
const prepareStaffWithCalendar = (
  browser: Browser,
  label: string,
  after: (page: Page, staff: StaffWithCalendar) => Promise<void> = async () => {},
) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
    const staff = newStaff(label)
    const token = await issueManagerToken()
    const registered = await registerStaff(page.request, token, staff)
    expect(registered.status()).toBe(201)
    const { id } = (await registered.json()) as { id: string }
    await createGoogleCalendar(page.request, staff.email)
    await createGoogleEvent(page.request, staff.email, {
      summary: '会議',
      date: '2027-03-04',
      start: '10:00',
      end: '11:00',
    })
    await linkStaffCalendar(page, id)
    const prepared = { id, name: staff.name, token }
    await after(page, prepared)
    return prepared
  })

/** 予定の取り込みの画面を、職員 staff を選んだ状態で開く。 */
const openImport = async (page: Page, staff: StaffWithCalendar) => {
  await page.goto(`/schedule/import?staff=${staff.id}`)
  await expect(page.getByTestId('calendar-import-staff')).toHaveValue(staff.id)
}

/** 期間を RANGE にして「プレビューする」を押す。 */
const previewRange = (page: Page) =>
  step(
    page,
    `期間を ${RANGE.start} から ${RANGE.end} にして、「プレビューする」を押す`,
    async () => {
      await page.getByTestId('calendar-import-start').fill(RANGE.start)
      await page.getByTestId('calendar-import-end').fill(RANGE.end)
      await page.getByTestId('calendar-import-preview').click()
      await expect(page.getByTestId('calendar-import-result-preview')).toContainText(
        'プレビューの結果',
      )
    },
  )

test.describe('予定の取り込み', () => {
  test.describe(`休職と退職の職員（${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('calendar-import-staff-on-leave 休職の職員のカレンダーをプレビューした場合、新しい予定が休職の職員の新しい予定として取り込まない予定に出ること', async ({
      browser,
      context,
    }) => {
      const staff = await prepareStaffWithCalendar(browser, 'evidence-leave', async (page, s) => {
        expect((await leaveStaff(page.request, s.token, s.id)).status()).toBe(200)
      })

      const page = await context.newPage()
      await openImport(page, staff)
      await intro(
        page,
        `休職の職員のカレンダーを「プレビューする」と、新しい予定が「休職の職員の新しい予定」として取り込まない予定に出て、確定して取り込むを押せない\n前提 予定の取り込みの画面で、${staff.name} を選んでいる。${staff.name} は休職している。カレンダーには 2027-03-04 の予定が 1 件ある`,
      )

      await previewRange(page)
      await check(
        page,
        '取り込むの箱が出ず、「取り込まない予定（1 件）」の表の理由に「休職の職員の新しい予定」が出て、「確定して取り込む」を押せない',
        async () => {
          await expect(page.getByTestId('calendar-import-count-import')).toBeHidden()
          await expect(page.getByTestId('calendar-import-skipped-heading')).toHaveText(
            '取り込まない予定（1 件）',
          )
          await page.getByTestId('calendar-import-skipped').scrollIntoViewIfNeeded()
          await expect(page.getByTestId('calendar-import-skipped')).toContainText(
            '休職の職員の新しい予定',
          )
          await expect(page.getByTestId('calendar-import-submit')).toBeDisabled()
        },
      )
    })

    test('calendar-import-reinstated 休職の職員を復職にした後にプレビューした場合、休職の間に足した予定を取り込めること', async ({
      browser,
      context,
    }) => {
      const staff = await prepareStaffWithCalendar(
        browser,
        'evidence-reinstate',
        async (page, s) => {
          expect((await leaveStaff(page.request, s.token, s.id)).status()).toBe(200)
          expect((await reinstateStaff(page.request, s.token, s.id)).status()).toBe(200)
        },
      )

      const page = await context.newPage()
      await openImport(page, staff)
      await intro(
        page,
        `休職の職員を復職にした後に「プレビューする」と、休職の間に足した予定が取り込む予定に出て、確定すると取り込める\n前提 予定の取り込みの画面で、${staff.name} を選んでいる。${staff.name} は休職の間に予定を足され、カレンダーを結び付けたまま復職した`,
      )

      await previewRange(page)
      await check(page, '取り込む 1 件が出て、「休職の職員の新しい予定」は出ない', async () => {
        await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
        await expect(page.getByTestId('calendar-import-skipped')).toBeHidden()
      })

      await step(page, '「確定して取り込む」を押す', () =>
        page.getByTestId('calendar-import-submit').click(),
      )
      await check(page, '取り込みの結果に、取り込んだ 1 件が出る', () =>
        expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件'),
      )
    })

    test('calendar-link-retired カレンダーを結び付けた職員を退職にした場合、カレンダーの連携の画面にその職員が出ないこと', async ({
      browser,
      context,
    }) => {
      const staff = await prepareStaffWithCalendar(browser, 'evidence-retire')

      const page = await context.newPage()
      await page.goto('/schedule/link')
      const row = page.getByTestId(`calendar-link-row-${staff.id}`)
      await expect(row).toBeVisible()
      await row.scrollIntoViewIfNeeded()
      await intro(
        page,
        `カレンダーを結び付けた職員を退職にすると、カレンダーが外れ、カレンダーの連携の画面にその職員が出ない\n前提 カレンダーの連携の画面で、${staff.name} にカレンダーを結び付けてある`,
      )
      // 読み直した後に、退職した職員の行があった位置を映すため、今の送りの位置を覚えておく
      const scrollY = await page.evaluate(() => window.scrollY)

      await step(
        page,
        `${staff.name} を退職にする\n（撮影のため、退職の画面がまだ無いので、職員の退職の API を呼ぶ）`,
        async () => {
          expect((await retireStaff(page.request, staff.token, staff.id)).status()).toBe(200)
        },
      )

      await step(page, 'カレンダーの連携の画面を読み直す', async () => {
        await page.reload()
        await expect(page.getByTestId('calendar-link-service-account')).toBeVisible()
      })
      // 送る操作には止めが入らず、字幕が読めないので、送ることは判定の字幕に書く
      await check(
        page,
        `職員の一覧に ${staff.name} の行が出ない\n（撮影のため、退職した職員の行があった位置まで一覧を送る）`,
        async () => {
          await expect(row).toHaveCount(0)
          await page.evaluate((y) => window.scrollTo(0, y), scrollY)
        },
      )
    })
  })
})
