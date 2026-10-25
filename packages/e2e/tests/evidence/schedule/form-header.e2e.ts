import { expect, test } from '@playwright/test'

import {
  DESKTOP_VIEWPORT,
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  recordPrEvidence,
  storyUrl,
} from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

const VIEWPORTS = [
  { label: 'パソコンの幅', name: 'schedule-form-header', viewport: DESKTOP_VIEWPORT },
  { label: 'スマートフォンの幅', name: 'schedule-form-header-phone', viewport: PHONE_VIEWPORT },
]

test.describe('予定の作成', () => {
  test.describe('ダイアログのヘッダー', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      for (const { label, name, viewport } of VIEWPORTS) {
        test(`${prefix}${label}で予定の作成のダイアログを開いた場合、タイトルが閉じるボタンの右隣に出て、種類のタブが右端に出ること`, async ({
          browser,
        }) => {
          const url = storyUrl('画面-schedule-scheduleformmodal--visit')
          await recordPrEvidence(
            browser,
            {
              name,
              title: `${label}で予定の作成のダイアログを開き、ヘッダーのタイトルと種類のタブの位置を見る`,
              actor: ACTOR,
              variant,
              viewport,
            },
            async (page) => {
              await page.goto(url)
            },
            async ({ page, step, check }) => {
              await page.goto(url)
              await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
              await expect(page.getByTestId('schedule-kind-tab')).toBeVisible()
              await step(
                `予定の作成のダイアログ（Storybook の ScheduleFormModal の Visit）を、${label}で開いている`,
              )
              // 並びの順と位置は Modal.test.tsx と ScheduleFormModal.test.tsx で確認し、ここでは見た目を撮る
              await check(
                'タイトルの「予定の作成」が閉じるボタンの右隣に出て、通常と訪問のタブがヘッダーの右端に出る',
              )
            },
          )
        })
      }
    }
  })
})
