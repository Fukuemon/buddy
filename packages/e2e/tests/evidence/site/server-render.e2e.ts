import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, SEED_PATIENT } from '../../fixtures/env'
import { pageHeading } from '../../selectors/page'

// 画面の JavaScript を止め、サーバーが描画した HTML だけを出す。字幕は録画に重ねて出すので、止めても出る
const blockScripts = (page: Page) =>
  page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.fallback(),
  )

const allowScripts = (page: Page) => page.unroute('**/*')

test.describe('サーバーでの描画', () => {
  // E2E_BASE_URL を compose の web（VITE_API_MODE=bff）に向けて撮る
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('server-render-bff bff のモードで、JavaScript を止めて職員と利用者と部署とチームの画面を開いた場合、サーバーで描画した HTML に見出しと一覧が入っていること', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(pageHeading(page, '職員')).toBeVisible()
      await intro(page, 'bff のモードで、サーバーで描画した HTML に見出しと一覧が入る')

      await step(page, '画面の JavaScript を止める', async () => {
        await blockScripts(page)
      })
      await step(page, '職員の画面を開き直す', async () => {
        await page.goto('/staff')
      })
      await check(page, 'JavaScript を止めても、職員の見出しと一覧が出る', async () => {
        await expect(pageHeading(page, '職員')).toBeVisible()
        await expect(page.getByTestId(`staff-list-row-${LOGIN_STAFF.id}`)).toBeVisible()
      })

      await step(page, '利用者の画面を開く', async () => {
        await page.goto('/patients')
      })
      await check(page, 'JavaScript を止めても、利用者の見出しと一覧が出る', async () => {
        await expect(pageHeading(page, '利用者')).toBeVisible()
        await expect(page.getByTestId(`patient-list-row-${SEED_PATIENT.id}`)).toBeVisible()
      })

      await step(page, '部署とチームの画面を開く', async () => {
        await page.goto('/organization')
      })
      await check(page, 'JavaScript を止めても、部署とチームの見出しと一覧が出る', () =>
        expect(pageHeading(page, '部署とチーム')).toBeVisible(),
      )

      await step(page, 'JavaScript を戻し、職員の画面を開き直す', async () => {
        await allowScripts(page)
        await page.goto('/staff')
        await page.getByTestId('staff-list-search').fill(LOGIN_STAFF.name)
      })
      await check(page, 'JavaScript を戻すと、名前で絞り込める', () =>
        expect(page.getByTestId('staff-list-count')).toHaveText('1 人'),
      )
    })
  })

  // E2E_BASE_URL を VITE_API_MODE=fake の開発サーバーに向けて撮る。fake はログインしない
  test.describe('ログインなし（fake のダミーの職員）', () => {
    test('server-render-fake fake のモードで職員の画面を開いた場合、サーバーでは描画せず、ブラウザで描画して動くこと', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(pageHeading(page, '職員')).toBeVisible()
      await intro(page, 'fake のモードでは、職員の画面をブラウザでだけ描画する')

      await step(page, '画面の JavaScript を止めて、職員の画面を開く', async () => {
        await blockScripts(page)
        await page.goto('/staff')
      })
      await check(page, 'サーバーは職員の画面を描画しないので、見出しも一覧も出ない', () =>
        expect(pageHeading(page, '職員')).toHaveCount(0),
      )

      await step(page, 'JavaScript を戻し、職員の画面を開き直す', async () => {
        await allowScripts(page)
        await page.goto('/staff')
      })
      await check(page, 'ブラウザで描画し、職員の見出しと一覧が出る', async () => {
        await expect(pageHeading(page, '職員')).toBeVisible()
        await expect(page.getByTestId('staff-list-count')).toBeVisible()
      })

      await step(page, '名前で絞り込む', () => page.getByTestId('staff-list-search').fill('青木'))
      await check(page, '名前で絞り込める', () =>
        expect(page.getByTestId('staff-list-count')).toHaveText('1 人'),
      )
    })
  })
})
