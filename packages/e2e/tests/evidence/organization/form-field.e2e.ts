import { expect, test, type Browser } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { createTeam, newUnitName } from '../../fixtures/organization'
import { PHONE_VIEWPORT, prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken } from '../../fixtures/staff'

const MANAGER = `${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり`

/** 録画の外で、マネージャーのトークンで青のチームを 1 つ作り、その ID と名前を返す。 */
const prepareBlueTeam = (browser: Browser) =>
  prepareOutsideRecording(browser, {}, async (page) => {
    const teamName = newUnitName('色')
    const teamId = await createTeam(page.request, await issueManagerToken(), {
      name: teamName,
      color: 'blue',
    })
    return { teamId, teamName }
  })

test.describe('部署とチームの入力の欄', () => {
  test.describe(`パソコンの幅（${MANAGER}）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('organization-department-name-error 部署の作成で名前を空のまま作るを押した場合、名前の欄の下に誤りの文が出て、欄の枠が強まること', async ({
      page,
    }) => {
      await page.goto('/organization')
      await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
      await intro(
        page,
        '部署の作成で名前を空のまま「作る」を押すと、名前の欄の下に誤りの文が出て、欄の枠が強まる',
      )

      const dialog = page.getByTestId('organization-list-department-dialog')
      await step(page, '「部署を作る」を押し、名前を空のまま「作る」を押す', async () => {
        await page.getByTestId('organization-list-department-new').click()
        await dialog.getByTestId('organization-list-department-submit').click()
      })
      await check(page, '名前の欄の下に誤りの文が出て、名前の欄の枠が赤く太くなる', async () => {
        // 誤りの文の testid は画面仕様書のモックにチームの分しか無いので、欄に結び付いた説明の文で確認する
        const name = dialog.getByTestId('organization-list-department-name')
        await expect(name).toHaveAccessibleDescription('名前を入れてください')
        await expect(name).toHaveAttribute('aria-invalid', 'true')
      })
    })

    test('organization-team-color-select チームの編集で色を選んだ場合、選んだ色の枠が強まること', async ({
      browser,
      context,
    }) => {
      const { teamId, teamName } = await prepareBlueTeam(browser)

      const page = await context.newPage()
      await page.goto('/organization')
      await page.getByTestId(`organization-list-team-edit-${teamId}`).click()
      const dialog = page.getByTestId('organization-list-team-dialog')
      await expect(dialog.getByTestId('organization-list-team-color-blue')).toBeChecked()
      await intro(
        page,
        `チームの編集で色を選ぶと、選んだ色の枠が強まる\n前提 「${teamName}」の編集のダイアログを開いている。色は青である`,
      )

      await step(page, '色の「黄緑」を押す', () =>
        dialog.getByTestId('organization-list-team-color-lime').click(),
      )
      await check(page, '黄緑の枠が太く青い枠になり、青の枠は元の細い枠に戻る', async () => {
        await expect(dialog.getByTestId('organization-list-team-color-lime')).toBeChecked()
        await expect(dialog.getByTestId('organization-list-team-color')).toHaveAccessibleName('色')
      })
    })

    test('organization-team-color-save チームの編集で色を選んで保存した場合、一覧のチームの色が変わること', async ({
      browser,
      context,
    }) => {
      const { teamId, teamName } = await prepareBlueTeam(browser)

      const page = await context.newPage()
      await page.goto('/organization')
      const dot = page.getByTestId(`organization-list-team-dot-${teamId}`)
      await expect(dot).toHaveClass(/bg-team-blue/)
      await dot.scrollIntoViewIfNeeded()
      await intro(
        page,
        `チームの編集で色を選んで保存すると、一覧のチームの色が変わる\n前提 チームの一覧で、「${teamName}」の点は青である`,
      )

      await step(page, '「編集」を押し、色の「黄緑」を選んで「保存」を押す', async () => {
        await page.getByTestId(`organization-list-team-edit-${teamId}`).click()
        const dialog = page.getByTestId('organization-list-team-dialog')
        await dialog.getByTestId('organization-list-team-color-lime').click()
        await dialog.getByTestId('organization-list-team-submit').click()
        await expect(dialog).toHaveCount(0)
      })
      await check(page, `チームの一覧の「${teamName}」の点が黄緑になる`, async () => {
        await expect(dot).toHaveClass(/bg-team-lime/)
        await dot.scrollIntoViewIfNeeded()
      })
    })
  })

  test.describe(`スマートフォンの幅（${MANAGER}）`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('organization-department-dialog-phone スマートフォンの幅で部署の作成を開いた場合、名前の欄の幅と間隔が置き換えの前と同じであること', async ({
      page,
    }) => {
      await page.goto('/organization')
      await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅で部署の作成を開くと、名前の欄の幅と間隔が置き換えの前と同じである\n前提 スマートフォンの幅で、部署とチームの画面を開いている',
      )

      await step(page, '「部署を作る」を押す', () =>
        page.getByTestId('organization-list-department-new').click(),
      )
      await check(page, '名前の見出しと欄が縦に並び、欄がダイアログの幅いっぱいに広がる', () =>
        expect(
          page
            .getByTestId('organization-list-department-dialog')
            .getByTestId('organization-list-department-name'),
        ).toBeFocused(),
      )
    })

    test('organization-team-dialog-phone スマートフォンの幅でチームの編集を開いた場合、名前の欄と色の組の幅と間隔が置き換えの前と同じであること', async ({
      browser,
      context,
    }) => {
      const { teamId, teamName } = await prepareBlueTeam(browser)

      const page = await context.newPage()
      await page.goto('/organization')
      const edit = page.getByTestId(`organization-list-team-edit-${teamId}`)
      await edit.scrollIntoViewIfNeeded()
      await intro(
        page,
        'スマートフォンの幅でチームの編集を開くと、名前の欄と色の組の幅と間隔が置き換えの前と同じである\n前提 スマートフォンの幅で、部署とチームの画面を開いている',
      )

      await step(page, `「${teamName}」の「編集」を押す`, () => edit.click())
      const dialog = page.getByTestId('organization-list-team-dialog')
      await check(page, '名前の欄と色の組が縦に並び、色は 2 列で並ぶ', () =>
        expect(dialog.getByTestId('organization-list-team-name')).toBeFocused(),
      )
      await check(page, '色の組の下に補足の文が出る', () =>
        dialog.getByTestId('organization-list-team-color').scrollIntoViewIfNeeded(),
      )
    })
  })
})
