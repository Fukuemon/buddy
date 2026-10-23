import { expect, test } from '@playwright/test'

import { FACILITY_SERVICE_ACCOUNT, LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'

const MORI = LEADER.staff
const MORI_CALENDAR = 'kenta.mori@example.com'
const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('カレンダーの連携', () => {
  test.describe('職員のカレンダーの結び付け', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}事業所のサービスアカウントに共有されていないカレンダーを確認した場合、読めない文が出て結び付けられないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-link-unreadable',
            title:
              '連携の画面に事業所のサービスアカウントが出て、共有されていないカレンダーは読めない文が出て結び付けられない',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule/link')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule/link')
            await expect(page.getByTestId('calendar-link-service-account')).toHaveText(
              FACILITY_SERVICE_ACCOUNT,
            )
            await check(
              `カレンダーの連携の画面に、この事業所の（架空の）サービスアカウント ${FACILITY_SERVICE_ACCOUNT} が出る`,
            )

            await step(
              `${MORI.name} の行の「結び付ける」を押し、カレンダーの ID に nobody@example.com を入れる`,
            )
            await page.getByTestId(`calendar-link-open-${MORI.id}`).click()
            await expect(page.getByTestId('calendar-link-dialog')).toBeVisible()
            await page.getByTestId('calendar-link-input').fill('nobody@example.com')

            await step('「読めるか確認する」を押す')
            await page.getByTestId('calendar-link-check').click()
            await expect(page.getByTestId('calendar-link-check-result')).toContainText(
              'このカレンダーを読めません。カレンダーをこの事業所の buddy のサービスアカウントに共有したか',
            )
            await expect(page.getByTestId('calendar-link-submit')).toBeDisabled()
            await check(
              '「このカレンダーを読めません。カレンダーをこの事業所の buddy のサービスアカウントに共有したか…」が出て、「結び付ける」を押せない',
            )
          },
        )
      })

      test(`${prefix}読めるカレンダーを職員に結び付けた場合、一覧の職員の行にカレンダーの ID が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-link-staff',
            title:
              '読めると確認したカレンダーを職員に結び付けると、一覧の職員の行にカレンダーの ID が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule/link')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            try {
              await page.goto('/schedule/link')
              await expect(page.getByTestId(`calendar-link-row-${MORI.id}`)).toBeVisible()
              await step('カレンダーの連携の画面を開いている')

              await step(`${MORI.name} の行の「結び付ける」を押す`)
              await page.getByTestId(`calendar-link-open-${MORI.id}`).click()
              await expect(page.getByTestId('calendar-link-input')).toHaveValue(MORI_CALENDAR)

              await step(`カレンダーの ID が ${MORI_CALENDAR} のまま、「読めるか確認する」を押す`)
              await page.getByTestId('calendar-link-check').click()
              await expect(page.getByTestId('calendar-link-check-result')).toContainText(
                '読めました。',
              )
              await check('「読めました。」が出る')

              await step('「結び付ける」を押す')
              await page.getByTestId('calendar-link-submit').click()
              await expect(page.getByTestId('calendar-link-dialog')).toBeHidden()
              await expect(page.getByTestId(`calendar-link-calendar-id-${MORI.id}`)).toHaveText(
                MORI_CALENDAR,
              )
              await check(`一覧の ${MORI.name} の行に ${MORI_CALENDAR} が出る`)
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, MORI.id)
            }
          },
        )
      })
    }
  })
})
