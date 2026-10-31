import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, mockUrl, recordPrEvidence } from '../../fixtures/evidence'
import { serviceTimeErrorInMock } from '../../selectors/scheduleEditMock'

const EDIT_INVALID = 'schedule-edit_予定の編集/mocks/10-invalid.html'

test.describe('予定の画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}予定の編集の入力エラーのモックを開いた場合、誤りの文が入力欄の下に出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-edit-invalid-mock',
          title:
            '予定の編集の入力エラーのモックで、提供時間の誤りの文が入力欄の枠の下に出て、aria-describedby で欄に結び付く',
          actor: 'ログインなし（画面仕様書のモック）',
          variant,
        },
        async (page) => {
          await page.goto(mockUrl(EDIT_INVALID))
        },
        async ({ page, step, check }) => {
          await page.goto(mockUrl(EDIT_INVALID))
          await step(
            '予定の編集の入力エラーのモック（10-invalid.html）を開いている。提供時間を消して保存を押したところである',
          )
          const input = page.getByTestId('schedule-form-service-time')
          const error = serviceTimeErrorInMock(page)
          await expect(error).toHaveText('提供時間を入力してください')
          await expect(input).not.toContainText('提供時間を入力してください')
          await expect(input).toHaveAttribute('aria-invalid', 'true')
          await expect(input).toHaveAttribute('aria-describedby', 'service-time-error')
          await expect
            .poll(async () => {
              const inputBox = await input.boundingBox()
              const errorBox = await error.boundingBox()
              if (inputBox === null || errorBox === null) return Number.NEGATIVE_INFINITY
              return errorBox.y - (inputBox.y + inputBox.height)
            })
            .toBeGreaterThanOrEqual(0)
          await check(
            '「提供時間を入力してください」が提供時間の入力欄の枠の外の下に出て、欄は aria-describedby でこの文を指す',
          )
        },
      )
    })
  }
})
