import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createGoogleCalendar, createGoogleEvent } from '../../fixtures/googleCalendar'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaff,
  reinstateStaff,
  retireStaff,
} from '../../fixtures/staff'
import { linkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** 取り込む期間。撮るたびに新しい職員のカレンダーを使うので、ほかの撮影の予定と重ならない。 */
const RANGE = { start: '2027-03-01', end: '2027-03-31' }

type StaffWithCalendar = { id: string; name: string; token: string }

/**
 * ログインして、新しい職員を登録し、その職員のカレンダーに 2027-03-04 の予定を 1 件足して、カレンダーを結び付ける。
 * カレンダーの ID は職員のメールで、カレンダーの連携の画面の入力の初期値になる。
 */
const prepareStaffWithCalendar = async (page: Page, label: string): Promise<StaffWithCalendar> => {
  await page.goto('/schedule/link')
  await signInAtBroker(page, LOGIN_EMAIL)
  const staff = newStaff(label)
  const token = await issueManagerToken(page.request)
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
  return { id, name: staff.name, token }
}

/** 予定の取り込みの画面で職員 staff を選び、RANGE をプレビューする。situation は、前提の字幕の 2 行目に出す職員の状態である。 */
const previewRange = async (
  page: Page,
  staff: StaffWithCalendar,
  step: (text: string) => Promise<void>,
  situation: string,
) => {
  await page.goto(`/schedule/import?staff=${staff.id}`)
  await expect(page.getByTestId('calendar-import-staff')).toHaveValue(staff.id)
  await step(`予定の取り込みの画面で、${staff.name} を選んでいる\n${situation}`)
  await step(`期間を ${RANGE.start} から ${RANGE.end} にして、「プレビューする」を押す`)
  await page.getByTestId('calendar-import-start').fill(RANGE.start)
  await page.getByTestId('calendar-import-end').fill(RANGE.end)
  await page.getByTestId('calendar-import-preview').click()
  await expect(page.getByTestId('calendar-import-result-preview')).toContainText('プレビューの結果')
}

test.describe('予定の取り込み', () => {
  test.describe('休職と退職の職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}休職の職員のカレンダーをプレビューした場合、新しい予定が休職の職員の新しい予定として取り込まない予定に出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-staff-on-leave',
            title:
              '休職の職員のカレンダーを「プレビューする」と、新しい予定が「休職の職員の新しい予定」として取り込まない予定に出て、確定して取り込むを押せない',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const staff = await prepareStaffWithCalendar(page, 'evidence-leave')
            expect((await leaveStaff(page.request, staff.token, staff.id)).status()).toBe(200)
            return staff
          },
          async ({ page, step, check }, staff) => {
            await previewRange(
              page,
              staff,
              step,
              `${staff.name} は休職している。カレンダーには 2027-03-04 の予定が 1 件ある`,
            )
            await expect(page.getByTestId('calendar-import-count-import')).toContainText('0 件')
            await expect(page.getByTestId('calendar-import-count-skipped')).toContainText('1 件')
            await page.getByTestId('calendar-import-skipped').scrollIntoViewIfNeeded()
            await expect(
              page.getByTestId('calendar-import-skipped-reason-staff_on_leave'),
            ).toHaveText('休職の職員の新しい予定: 1 件')
            await expect(page.getByTestId('calendar-import-submit')).toBeDisabled()
            await check(
              '取り込む 0 件、取り込まない 1 件で、理由に「休職の職員の新しい予定: 1 件」が出て、「確定して取り込む」を押せない',
            )
          },
        )
      })

      test(`${prefix}休職の職員を復職にした後にプレビューした場合、休職の間に足した予定を取り込めること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-reinstated',
            title:
              '休職の職員を復職にした後に「プレビューする」と、休職の間に足した予定が取り込む予定に出て、確定すると取り込める',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const staff = await prepareStaffWithCalendar(page, 'evidence-reinstate')
            expect((await leaveStaff(page.request, staff.token, staff.id)).status()).toBe(200)
            expect((await reinstateStaff(page.request, staff.token, staff.id)).status()).toBe(200)
            return staff
          },
          async ({ page, step, check }, staff) => {
            await previewRange(
              page,
              staff,
              step,
              `${staff.name} は休職の間に予定を足され、カレンダーを結び付けたまま復職した`,
            )
            await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
            await expect(
              page.getByTestId('calendar-import-skipped-reason-staff_on_leave'),
            ).toBeHidden()
            await check('取り込む 1 件が出て、「休職の職員の新しい予定」は出ない')

            await step('「確定して取り込む」を押す')
            await page.getByTestId('calendar-import-submit').click()
            await expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件')
            await check('取り込みの結果に、取り込んだ 1 件が出る')
          },
        )
      })

      test(`${prefix}カレンダーを結び付けた職員を退職にした場合、カレンダーの連携の画面にその職員が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-link-retired',
            title:
              'カレンダーを結び付けた職員を退職にすると、カレンダーが外れ、カレンダーの連携の画面にその職員が出ない',
            actor: ACTOR,
            variant,
          },
          async (page) => prepareStaffWithCalendar(page, 'evidence-retire'),
          async ({ page, step, check }, staff) => {
            await page.goto('/schedule/link')
            await expect(page.getByTestId(`calendar-link-row-${staff.id}`)).toBeVisible()
            await page.getByTestId(`calendar-link-row-${staff.id}`).scrollIntoViewIfNeeded()
            await step(`カレンダーの連携の画面で、${staff.name} にカレンダーを結び付けてある`)

            await step(
              `${staff.name} を退職にする\n（撮影のため、退職の画面がまだ無いので、職員の退職の API を呼ぶ）`,
            )
            expect((await retireStaff(page.request, staff.token, staff.id)).status()).toBe(200)

            await step('カレンダーの連携の画面を読み直す')
            await page.reload()
            await expect(page.getByTestId('calendar-link-service-account')).toBeVisible()
            await expect(page.getByTestId(`calendar-link-row-${staff.id}`)).toHaveCount(0)
            await check(`職員の一覧に ${staff.name} の行が出ない`)
          },
        )
      })
    }
  })
})
