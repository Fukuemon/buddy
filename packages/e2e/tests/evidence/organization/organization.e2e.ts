import { expect, test, type Browser, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { createTeam, moveStaffToTeam, newUnitName } from '../../fixtures/organization'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'

/** 録画の外で、マネージャーのトークンで青のチームと、そのチームの職員を 1 人作る。 */
const prepareBlueTeamWithStaff = (browser: Browser) =>
  prepareOutsideRecording(browser, {}, async (page) => {
    const token = await issueManagerToken()
    const teamName = newUnitName('色')
    const teamId = await createTeam(page.request, token, { name: teamName, color: 'blue' })
    const staff = newStaff('team-color')
    const id = await registerStaffId(page.request, token, staff)
    await moveStaffToTeam(page.request, token, { id, name: staff.name }, teamId)
    return { teamId, teamName, staffId: id, staffName: staff.name }
  })

/** 部署とチームの画面で、チーム teamId の色を黄緑に変える。 */
const changeTeamColorToLime = async (page: Page, teamId: string) => {
  await page.getByTestId(`organization-list-team-edit-${teamId}`).click()
  const dialog = page.getByTestId('organization-list-team-dialog')
  await dialog.getByTestId('organization-list-team-color-lime').click()
  await dialog.getByTestId('organization-list-team-submit').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId(`organization-list-team-dot-${teamId}`)).toHaveClass(/bg-team-lime/)
}

test.describe('部署とチーム', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test.describe('チームの作成', () => {
      test('organization-team-create 職員の管理の権限を持つ職員が色を選んでチームを作った場合、チームの一覧に色の点と名前が出ること', async ({
        page,
      }) => {
        const name = newUnitName('チーム')
        await page.goto('/organization')
        await expect(page.getByTestId('organization-list-team-new')).toBeVisible()
        await intro(
          page,
          '職員の管理の権限を持つ職員が色を選んでチームを作ると、チームの一覧に色の点と名前が出る',
        )

        const dialog = page.getByTestId('organization-list-team-dialog')
        await step(page, '「チームを作る」を押し、名前を入れて、色に「緑」を選ぶ', async () => {
          await page.getByTestId('organization-list-team-new').click()
          await dialog.getByTestId('organization-list-team-name').fill(name)
          await dialog.getByTestId('organization-list-team-color-green').click()
          await expect(dialog.getByTestId('organization-list-team-color-green')).toBeChecked()
        })
        await step(page, '「作る」を押す', async () => {
          await dialog.getByTestId('organization-list-team-submit').click()
          await expect(dialog).toHaveCount(0)
        })
        await check(page, `チームの一覧に、緑の点と「${name}」が出る`, async () => {
          const row = page.getByTestId(/^organization-list-team-row-/).filter({ hasText: name })
          await expect(row).toHaveCount(1)
          await row.scrollIntoViewIfNeeded()
          await expect(row.getByTestId(/^organization-list-team-dot-/)).toHaveClass(/bg-team-green/)
        })
      })
    })

    test.describe('チームの色の変更', () => {
      test('organization-team-color-staff-list チームの色を変えた場合、職員の一覧のチームの点が新しい色になること', async ({
        browser,
        context,
      }) => {
        const { teamId, teamName, staffId, staffName } = await prepareBlueTeamWithStaff(browser)

        const page = await context.newPage()
        const dot = page.getByTestId(`staff-list-team-dot-${staffId}`).filter({ visible: true })
        await page.goto('/staff')
        await page.getByTestId('staff-list-search').fill(staffName)
        await expect(dot).toHaveClass(/bg-team-blue/)
        await intro(
          page,
          `チームの色を変えると、職員の一覧のチームの点が新しい色になる\n前提 職員の一覧で、「${teamName}」の職員の点は青である`,
        )

        await step(
          page,
          `部署とチームの画面で、「${teamName}」の色を黄緑に変えて保存する`,
          async () => {
            await page.goto('/organization')
            await changeTeamColorToLime(page, teamId)
          },
        )
        await step(page, '職員の一覧を開き直す', async () => {
          await page.goto('/staff')
          await page.getByTestId('staff-list-search').fill(staffName)
        })
        await check(page, `職員の一覧の「${teamName}」の点が黄緑になる`, () =>
          expect(dot).toHaveClass(/bg-team-lime/),
        )
      })

      test('organization-team-color-calendar チームの色を変えた場合、カレンダーの職員の絞り込みの見出しの点が新しい色になること', async ({
        browser,
        context,
      }) => {
        const { teamId, teamName } = await prepareBlueTeamWithStaff(browser)

        const page = await context.newPage()
        const dot = page.getByTestId(`staff-filter-team-dot-${teamId}`)
        await page.goto('/schedule')
        await expect(dot).toHaveClass(/bg-team-blue/)
        await dot.scrollIntoViewIfNeeded()
        await intro(
          page,
          `チームの色を変えると、カレンダーの職員の絞り込みの見出しの点が新しい色になる\n前提 カレンダーの職員の絞り込みで、「${teamName}」の見出しの点は青である`,
        )

        await step(
          page,
          `部署とチームの画面で、「${teamName}」の色を黄緑に変えて保存する`,
          async () => {
            await page.goto('/organization')
            await changeTeamColorToLime(page, teamId)
          },
        )
        await step(page, 'カレンダーを開き直す', async () => {
          await page.goto('/schedule')
        })
        await check(page, `職員の絞り込みの「${teamName}」の見出しの点が黄緑になる`, async () => {
          await expect(dot).toHaveClass(/bg-team-lime/)
          await dot.scrollIntoViewIfNeeded()
        })
      })
    })

    test.describe('部署の作成と名前の変更', () => {
      test('organization-department-create 部署を作った場合、部署の一覧に作った名前が出ること', async ({
        page,
      }) => {
        const name = newUnitName('部署')
        await page.goto('/organization')
        await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
        await intro(page, '部署を作ると、部署の一覧に作った名前が出る')

        await step(page, '「部署を作る」を押し、名前を入れて「作る」を押す', async () => {
          await page.getByTestId('organization-list-department-new').click()
          const dialog = page.getByTestId('organization-list-department-dialog')
          await dialog.getByTestId('organization-list-department-name').fill(name)
          await dialog.getByTestId('organization-list-department-submit').click()
          await expect(dialog).toHaveCount(0)
        })
        await check(page, `部署の一覧に「${name}」が出る`, () =>
          expect(
            page.getByTestId(/^organization-list-department-row-/).filter({ hasText: name }),
          ).toHaveCount(1),
        )
      })

      test('organization-department-rename 部署の名前を変えた場合、部署の一覧の名前が変わること', async ({
        browser,
        context,
      }) => {
        const name = newUnitName('部署')
        const renamed = `${name} 改`
        await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (prepPage) => {
          await prepPage.goto('/organization')
          await prepPage.getByTestId('organization-list-department-new').click()
          const dialog = prepPage.getByTestId('organization-list-department-dialog')
          await dialog.getByTestId('organization-list-department-name').fill(name)
          await dialog.getByTestId('organization-list-department-submit').click()
          await expect(dialog).toHaveCount(0)
        })

        const page = await context.newPage()
        await page.goto('/organization')
        const row = page.getByTestId(/^organization-list-department-row-/).filter({
          hasText: name,
        })
        await expect(row).toHaveCount(1)
        await intro(
          page,
          `部署の名前を変えると、部署の一覧の名前が変わる\n前提 部署の一覧に「${name}」がある`,
        )

        await step(
          page,
          `「${name}」の「編集」を押し、名前を「${renamed}」に変えて「保存」を押す`,
          async () => {
            await row.getByTestId(/^organization-list-department-edit-/).click()
            const dialog = page.getByTestId('organization-list-department-dialog')
            await expect(dialog.getByTestId('organization-list-department-name')).toHaveValue(name)
            await dialog.getByTestId('organization-list-department-name').fill(renamed)
            await dialog.getByTestId('organization-list-department-submit').click()
            await expect(dialog).toHaveCount(0)
          },
        )
        await check(page, `部署の一覧の名前が「${renamed}」になる`, () =>
          expect(row.getByTestId(/^organization-list-department-edit-/)).toHaveAccessibleName(
            `${renamed}を編集`,
          ),
        )
      })
    })
  })

  test.describe(`権限が無い職員（${LEADER.staff.name}、チームリーダー、職員の管理の権限なし）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('organization-forbidden-page 職員の管理の権限を持たない職員が画面の URL を開いた場合、権限が無いことの案内が出て、部署とチームの管理の画面が出ないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
      await intro(
        page,
        '職員の管理の権限を持たない職員が /organization を開くと、権限が無いことの案内が出て、部署とチームの管理の画面が出ない',
      )

      await step(page, '/organization を開く', async () => {
        await page.goto('/organization')
      })
      await check(
        page,
        '「この画面を開く権限がありません」の案内が出て、部署とチームの一覧と作るボタンが出ない',
        async () => {
          await expect(page.getByTestId('page-forbidden')).toBeVisible()
          await expect(page.getByTestId('organization-list-team-new')).toHaveCount(0)
          await expect(page.getByTestId('organization-list-department-new')).toHaveCount(0)
        },
      )
    })

    test('organization-forbidden-nav 職員の管理の権限を持たない職員の場合、ナビゲーションに部署とチームが無いこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
      await intro(page, '職員の管理の権限を持たない職員のナビゲーションに「部署とチーム」が無い')

      await check(page, 'ナビゲーションに「部署とチーム」が無い', async () => {
        await expect(page.getByTestId('site-nav-organization')).toHaveCount(0)
        await expect(page.getByTestId('site-nav')).not.toContainText('部署とチーム')
      })
    })
  })
})
