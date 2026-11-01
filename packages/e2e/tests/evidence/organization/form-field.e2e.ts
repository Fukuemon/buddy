import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { createTeam, newUnitName } from '../../fixtures/organization'
import { issueManagerToken } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーでログインする。 */
const signInManager = async (page: Page) => {
  await page.goto('/organization')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** マネージャーでログインし、青のチームを 1 つ作って、その ID と名前を返す。 */
const prepareBlueTeam = async (page: Page) => {
  await signInManager(page)
  const teamName = newUnitName('色')
  const teamId = await createTeam(page.request, await issueManagerToken(page.request), {
    name: teamName,
    color: 'blue',
  })
  return { teamId, teamName }
}

test.describe('部署とチームの入力の欄', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}部署の作成で名前を空のまま作るを押した場合、名前の欄の下に誤りの文が出て、欄の枠が強まること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'organization-department-name-error',
          title:
            '部署の作成で名前を空のまま「作る」を押すと、名前の欄の下に誤りの文が出て、欄の枠が強まる',
          actor: MANAGER,
          variant,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/organization')
          await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
          await step('部署とチームの画面を開いている')

          await step('「部署を作る」を押し、名前を空のまま「作る」を押す')
          await page.getByTestId('organization-list-department-new').click()
          const dialog = page.getByTestId('organization-list-department-dialog')
          await dialog.getByTestId('organization-list-department-submit').click()
          await expect(dialog.getByTestId('organization-list-department-error-name')).toBeVisible()
          await expect(dialog.getByTestId('organization-list-department-name')).toHaveAttribute(
            'aria-invalid',
            'true',
          )
          await check('名前の欄の下に誤りの文が出て、名前の欄の枠が赤く太くなる')
        },
      )
    })

    test(`${prefix}チームの編集で色を選んだ場合、選んだ色の枠が強まること`, async ({ browser }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'organization-team-color-select',
          title: 'チームの編集で色を選ぶと、選んだ色の枠が強まる',
          actor: MANAGER,
          variant,
        },
        prepareBlueTeam,
        async ({ page, step, check }, { teamId, teamName }) => {
          await page.goto('/organization')
          await page.getByTestId(`organization-list-team-edit-${teamId}`).click()
          const dialog = page.getByTestId('organization-list-team-dialog')
          await expect(dialog.getByTestId('organization-list-team-color-blue')).toBeChecked()
          await step(`「${teamName}」の編集のダイアログを開いている。色は青である`)

          await step('色の「黄緑」を押す')
          await dialog.getByTestId('organization-list-team-color-lime').click()
          await expect(dialog.getByTestId('organization-list-team-color-lime')).toBeChecked()
          await expect(dialog.getByTestId('organization-list-team-color')).toHaveAccessibleName(
            '色',
          )
          await check('黄緑の枠が太く青い枠になり、青の枠は元の細い枠に戻る')
        },
      )
    })

    test(`${prefix}チームの編集で色を選んで保存した場合、一覧のチームの色が変わること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'organization-team-color-save',
          title: 'チームの編集で色を選んで保存すると、一覧のチームの色が変わる',
          actor: MANAGER,
          variant,
        },
        prepareBlueTeam,
        async ({ page, step, check }, { teamId, teamName }) => {
          await page.goto('/organization')
          const dot = page.getByTestId(`organization-list-team-dot-${teamId}`)
          await expect(dot).toHaveClass(/bg-team-blue/)
          await dot.scrollIntoViewIfNeeded()
          await step(`チームの一覧で、「${teamName}」の点は青である`)

          await step('「編集」を押し、色の「黄緑」を選んで「保存」を押す')
          await page.getByTestId(`organization-list-team-edit-${teamId}`).click()
          const dialog = page.getByTestId('organization-list-team-dialog')
          await dialog.getByTestId('organization-list-team-color-lime').click()
          await dialog.getByTestId('organization-list-team-submit').click()
          await expect(dialog).toHaveCount(0)
          await expect(dot).toHaveClass(/bg-team-lime/)
          await dot.scrollIntoViewIfNeeded()
          await check(`チームの一覧の「${teamName}」の点が黄緑になる`)
        },
      )
    })

    test(`${prefix}スマートフォンの幅で部署の作成を開いた場合、名前の欄の幅と間隔が置き換えの前と同じであること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'organization-department-dialog-phone',
          title:
            'スマートフォンの幅で部署の作成を開くと、名前の欄の幅と間隔が置き換えの前と同じである',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/organization')
          await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
          await step('スマートフォンの幅で、部署とチームの画面を開いている')

          await step('「部署を作る」を押す')
          await page.getByTestId('organization-list-department-new').click()
          const dialog = page.getByTestId('organization-list-department-dialog')
          await expect(dialog.getByTestId('organization-list-department-name')).toBeFocused()
          await check('名前の見出しと欄が縦に並び、欄がダイアログの幅いっぱいに広がる')
        },
      )
    })

    test(`${prefix}スマートフォンの幅でチームの編集を開いた場合、名前の欄と色の組の幅と間隔が置き換えの前と同じであること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'organization-team-dialog-phone',
          title:
            'スマートフォンの幅でチームの編集を開くと、名前の欄と色の組の幅と間隔が置き換えの前と同じである',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        prepareBlueTeam,
        async ({ page, step, check }, { teamId, teamName }) => {
          await page.goto('/organization')
          const edit = page.getByTestId(`organization-list-team-edit-${teamId}`)
          await edit.scrollIntoViewIfNeeded()
          await step(`スマートフォンの幅で、部署とチームの画面を開いている`)

          await step(`「${teamName}」の「編集」を押す`)
          await edit.click()
          const dialog = page.getByTestId('organization-list-team-dialog')
          await expect(dialog.getByTestId('organization-list-team-name')).toBeFocused()
          await check('名前の欄と色の組が縦に並び、色は 2 列で並ぶ')

          await dialog.getByTestId('organization-list-team-color').scrollIntoViewIfNeeded()
          await check('色の組の下に補足の文が出る')
        },
      )
    })
  }
})
