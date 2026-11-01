import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  recordPrEvidence,
  storyUrl,
} from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { scheduleDetailValues } from '../../selectors/scheduleDetail'

const STORY_ACTOR = 'ログインなし（Storybook の story）'
const VISIT_URL = storyUrl('画面-schedule-scheduledetailmodal--visit')
const NORMAL_URL = storyUrl('画面-schedule-scheduledetailmodal--normal')

const openDetail = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

/** 予定の詳細の値の左端の x のうち、違うものの数。全ての段の値の列がそろえば 1 になる。 */
const valueLeftCount = async (page: Page) => {
  const boxes = await Promise.all(
    (await scheduleDetailValues(page).all()).map((value) => value.boundingBox()),
  )
  return new Set(boxes.map((box) => Math.round(box?.x ?? -1))).size
}

/** 録画の外で、ログインし、今日の日の表示に自分の訪問の予定を 1 件作っておく。 */
const createVisit = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
  await page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`).check()
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

test.describe('予定のカレンダー', () => {
  test.describe('予定の詳細のセクション', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}訪問の予定の詳細を開いた場合、全ての段の値が同じ列の位置にそろって出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-value-column',
            title: '訪問の予定の詳細を開くと、上の段と訪問の情報の段の値が同じ列の位置にそろう',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          createVisit,
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            const visit = page
              .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: `${SEED_PATIENT.name} 訪問` })
              .first()
            await expect(visit).toBeVisible()
            await step(`予定のカレンダーの日の表示に、${SEED_PATIENT.name} の訪問の予定がある`)

            await step('訪問の予定を押し、予定の詳細を開く')
            await visit.click()
            await expect(page.getByTestId('schedule-detail-visit')).toContainText(SEED_PATIENT.name)
            // 種類、主訪問者、利用者、サービスコード、訪問の区分の 5 つ
            await expect(scheduleDetailValues(page)).toHaveCount(5)
            await expect.poll(() => valueLeftCount(page)).toBe(1)
            await check(
              '種類と主訪問者の段と、訪問の情報の段（利用者、サービスコード、訪問の区分）の値が、同じ左端の位置に 1 列で並ぶ',
            )
          },
        )
      })

      test(`${prefix}メモの無い訪問の予定の詳細を開いた場合、日時の見出しと訪問の情報のセクションが出て、メモの見出しが出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-visit-sections',
            title: '訪問の予定の詳細を開き、日時の見出しとセクションの分け方を見る',
            actor: STORY_ACTOR,
            variant,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await step('訪問の予定の詳細（Storybook の ScheduleDetailModal の Visit）を開いている')
            await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
              '2026年10月20日（火） 09:00〜09:29',
            )
            await expect(page.getByTestId('schedule-detail-visit')).toContainText('加藤 春子')
            await expect.poll(() => valueLeftCount(page)).toBe(1)
            await expect(page.getByTestId('schedule-detail-memo')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-modal')).not.toContainText('なし')
            await check(
              '日時と曜日が見出しになり、利用者、サービスコード、訪問の区分が「訪問の情報」のセクションに、上の段と同じ列の位置でまとまり、メモが空なのでメモの見出しも「なし」も出ない',
            )
          },
        )
      })

      test(`${prefix}通常の予定の詳細を開いた場合、訪問の情報のセクションが出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-normal-sections',
            title: '通常の予定の詳細を開き、セクションの分け方を見る',
            actor: STORY_ACTOR,
            variant,
          },
          openDetail(NORMAL_URL),
          async ({ page, step, check }) => {
            await openDetail(NORMAL_URL)(page)
            await step('通常の予定の詳細（Storybook の ScheduleDetailModal の Normal）を開いている')
            await expect(page.getByTestId('schedule-detail-memo')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-visit')).toHaveCount(0)
            await check(
              '日時の見出しの下に種類、タイトル、予定者が並び、訪問の情報のセクションは出ず、メモのセクションが出る',
            )
          },
        )
      })

      test(`${prefix}スマートフォンの幅で訪問の予定の詳細を開いた場合、訪問の情報が上の段と同じ列の位置で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-visit-phone',
            title: 'スマートフォンの幅で、訪問の予定の詳細を開く',
            actor: STORY_ACTOR,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await step('幅 390px で、訪問の予定の詳細を開いている')
            await expect(scheduleDetailValues(page)).toHaveCount(5)
            await expect.poll(() => valueLeftCount(page)).toBe(1)
            await check('訪問の情報の 3 つの項目が、上の段と同じ列の位置で縦に並ぶ')
          },
        )
      })
    }
  })
})
