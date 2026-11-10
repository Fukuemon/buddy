import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { FACILITY_SERVICE_ACCOUNT, LEADER, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'

const MORI = LEADER.staff

test.describe('カレンダーの連携', () => {
  test.describe(`共有の手順（${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('calendar-link-guide-first どの職員も結び付けていない事業所で連携の画面を開いた場合、共有の手順を開いた状態で出すこと', async ({
      page,
    }) => {
      await page.goto('/schedule/link')
      await expect(page.getByTestId(`calendar-link-open-${MORI.id}`)).toBeVisible()
      // ほかの spec が結び付けを残していれば、全員が未連携という前提が崩れるので、ここで落とす
      await expect(page.getByTestId(/^calendar-link-menu-/)).toHaveCount(0)
      await intro(page, 'どの職員もカレンダーを結び付けていない事業所で、連携の画面を開く')

      await check(
        page,
        `どの職員も結び付けていないので、「カレンダーの共有」の「共有する相手のメールアドレス」に ${FACILITY_SERVICE_ACCOUNT} とコピーのボタンが並び、「詳しく」の下の 3 つの共有の手順が開いた状態で出る`,
        async () => {
          await expect(page.getByTestId('calendar-link-service-account')).toHaveText(
            FACILITY_SERVICE_ACCOUNT,
          )
          await expect(page.getByTestId('calendar-link-guide-toggle')).toHaveAttribute(
            'aria-expanded',
            'true',
          )
          await expect(page.getByTestId('calendar-link-steps')).toBeVisible()
        },
      )
    })

    test('calendar-link-guide-toggle 結び付けた職員がいる事業所で詳しくのボタンを押した場合、閉じていた手順が開き、もう一度押すと閉じること', async ({
      browser,
      context,
    }) => {
      await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, (page) =>
        linkStaffCalendar(page, MORI.id),
      )

      const page = await context.newPage()
      try {
        await page.goto('/schedule/link')
        const toggle = page.getByTestId('calendar-link-guide-toggle')
        const steps = page.getByTestId('calendar-link-steps')
        await expect(page.getByTestId(`calendar-link-menu-${MORI.id}`)).toBeVisible()
        await intro(
          page,
          '結び付けた職員がいる事業所で、「詳しく」のボタンで共有の手順を開いて閉じる',
        )

        await check(
          page,
          `${MORI.name} にカレンダーを結び付けているので、共有の手順は閉じている。共有する相手のメールアドレスとコピーのボタンは出ている`,
          async () => {
            await expect(toggle).toHaveAttribute('aria-expanded', 'false')
            await expect(steps).toBeHidden()
            await expect(page.getByTestId('calendar-link-service-account')).toHaveText(
              FACILITY_SERVICE_ACCOUNT,
            )
            await expect(page.getByTestId('calendar-link-copy')).toBeVisible()
          },
        )

        await step(page, 'メールアドレスの下の 1 文に続く「詳しく」のボタンを押す', () =>
          toggle.click(),
        )
        await check(page, 'ボタンの下に、3 つの共有の手順が開く', async () => {
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await expect(steps).toBeVisible()
        })

        await step(page, 'もう一度「詳しく」のボタンを押す', () => toggle.click())
        await check(page, '共有の手順が閉じる', async () => {
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
          await expect(steps).toBeHidden()
        })
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, MORI.id),
        )
      }
    })
  })
})
