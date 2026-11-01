import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createTeam, moveStaffToTeam, newUnitName } from '../../fixtures/organization'
import { issueManagerToken, newStaff, registerStaff } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`
const LEADER_ACTOR = `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`

/** マネージャーでログインし、青のチームと、そのチームの職員を 1 人作る。 */
const prepareBlueTeamWithStaff = async (page: Page) => {
  await page.goto('/organization')
  await signInAtBroker(page, LOGIN_EMAIL)
  const token = await issueManagerToken(page.request)
  const teamName = newUnitName('色')
  const teamId = await createTeam(page.request, token, { name: teamName, color: 'blue' })
  const staff = newStaff('team-color')
  const registered = await registerStaff(page.request, token, staff)
  const { id } = (await registered.json()) as { id: string }
  await moveStaffToTeam(page.request, token, { id, name: staff.name }, teamId)
  return { teamId, teamName, staffId: id, staffName: staff.name }
}

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
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test.describe('チームの作成', () => {
      test(`${prefix}職員の管理の権限を持つ職員が色を選んでチームを作った場合、チームの一覧に色の点と名前が出ること`, async ({
        browser,
      }) => {
        const name = newUnitName('チーム')
        await recordPrEvidence(
          browser,
          {
            name: 'organization-team-create',
            title:
              '職員の管理の権限を持つ職員が色を選んでチームを作ると、チームの一覧に色の点と名前が出る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/organization')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/organization')
            await expect(page.getByTestId('organization-list-team-new')).toBeVisible()
            await step('部署とチームの画面を開いている')

            await step('「チームを作る」を押し、名前を入れて、色に「緑」を選ぶ')
            await page.getByTestId('organization-list-team-new').click()
            const dialog = page.getByTestId('organization-list-team-dialog')
            await dialog.getByTestId('organization-list-team-name').fill(name)
            await dialog.getByTestId('organization-list-team-color-green').click()
            await expect(dialog.getByTestId('organization-list-team-color-green')).toBeChecked()

            await step('「作る」を押す')
            await dialog.getByTestId('organization-list-team-submit').click()
            await expect(dialog).toHaveCount(0)
            const row = page.getByTestId(/^organization-list-team-row-/).filter({ hasText: name })
            await expect(row).toHaveCount(1)
            await row.scrollIntoViewIfNeeded()
            await expect(row.getByTestId(/^organization-list-team-dot-/)).toHaveClass(
              /bg-team-green/,
            )
            await check(`チームの一覧に、緑の点と「${name}」が出る`)
          },
        )
      })
    })

    test.describe('チームの色の変更', () => {
      test(`${prefix}チームの色を変えた場合、職員の一覧のチームの点が新しい色になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'organization-team-color-staff-list',
            title: 'チームの色を変えると、職員の一覧のチームの点が新しい色になる',
            actor: MANAGER,
            variant,
          },
          prepareBlueTeamWithStaff,
          async ({ page, step, check }, { teamId, teamName, staffId, staffName }) => {
            await page.goto('/staff')
            await page.getByTestId('staff-list-search').fill(staffName)
            await expect(
              page.getByTestId(`staff-list-team-dot-${staffId}`).filter({ visible: true }),
            ).toHaveClass(/bg-team-blue/)
            await step(`職員の一覧で、「${teamName}」の職員の点は青である`)

            await step(`部署とチームの画面で、「${teamName}」の色を黄緑に変えて保存する`)
            await page.goto('/organization')
            await changeTeamColorToLime(page, teamId)

            await step('職員の一覧を開き直す')
            await page.goto('/staff')
            await page.getByTestId('staff-list-search').fill(staffName)
            await expect(
              page.getByTestId(`staff-list-team-dot-${staffId}`).filter({ visible: true }),
            ).toHaveClass(/bg-team-lime/)
            await check(`職員の一覧の「${teamName}」の点が黄緑になる`)
          },
        )
      })

      test(`${prefix}チームの色を変えた場合、カレンダーの職員の絞り込みの見出しの点が新しい色になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'organization-team-color-calendar',
            title: 'チームの色を変えると、カレンダーの職員の絞り込みの見出しの点が新しい色になる',
            actor: MANAGER,
            variant,
          },
          prepareBlueTeamWithStaff,
          async ({ page, step, check }, { teamId, teamName }) => {
            await page.goto('/schedule')
            const dot = page.getByTestId(`staff-filter-team-dot-${teamId}`)
            await expect(dot).toHaveClass(/bg-team-blue/)
            await dot.scrollIntoViewIfNeeded()
            await step(`カレンダーの職員の絞り込みで、「${teamName}」の見出しの点は青である`)

            await step(`部署とチームの画面で、「${teamName}」の色を黄緑に変えて保存する`)
            await page.goto('/organization')
            await changeTeamColorToLime(page, teamId)

            await step('カレンダーを開き直す')
            await page.goto('/schedule')
            await expect(dot).toHaveClass(/bg-team-lime/)
            await dot.scrollIntoViewIfNeeded()
            await check(`職員の絞り込みの「${teamName}」の見出しの点が黄緑になる`)
          },
        )
      })
    })

    test.describe('部署の作成と名前の変更', () => {
      test(`${prefix}部署を作った場合、部署の一覧に作った名前が出ること`, async ({ browser }) => {
        const name = newUnitName('部署')
        await recordPrEvidence(
          browser,
          {
            name: 'organization-department-create',
            title: '部署を作ると、部署の一覧に作った名前が出る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/organization')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/organization')
            await expect(page.getByTestId('organization-list-department-new')).toBeVisible()
            await step('部署とチームの画面を開いている')

            await step('「部署を作る」を押し、名前を入れて「作る」を押す')
            await page.getByTestId('organization-list-department-new').click()
            const dialog = page.getByTestId('organization-list-department-dialog')
            await dialog.getByTestId('organization-list-department-name').fill(name)
            await dialog.getByTestId('organization-list-department-submit').click()
            await expect(dialog).toHaveCount(0)
            await expect(
              page.getByTestId(/^organization-list-department-row-/).filter({ hasText: name }),
            ).toHaveCount(1)
            await check(`部署の一覧に「${name}」が出る`)
          },
        )
      })

      test(`${prefix}部署の名前を変えた場合、部署の一覧の名前が変わること`, async ({ browser }) => {
        const name = newUnitName('部署')
        const renamed = `${name} 改`
        await recordPrEvidence(
          browser,
          {
            name: 'organization-department-rename',
            title: '部署の名前を変えると、部署の一覧の名前が変わる',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/organization')
            await signInAtBroker(page, LOGIN_EMAIL)
            await page.getByTestId('organization-list-department-new').click()
            const dialog = page.getByTestId('organization-list-department-dialog')
            await dialog.getByTestId('organization-list-department-name').fill(name)
            await dialog.getByTestId('organization-list-department-submit').click()
            await expect(dialog).toHaveCount(0)
          },
          async ({ page, step, check }) => {
            await page.goto('/organization')
            const row = page.getByTestId(/^organization-list-department-row-/).filter({
              hasText: name,
            })
            await expect(row).toHaveCount(1)
            await step(`部署の一覧に「${name}」がある`)

            await step(`「${name}」の「編集」を押し、名前を「${renamed}」に変えて「保存」を押す`)
            await row.getByTestId(/^organization-list-department-edit-/).click()
            const dialog = page.getByTestId('organization-list-department-dialog')
            await expect(dialog.getByTestId('organization-list-department-name')).toHaveValue(name)
            await dialog.getByTestId('organization-list-department-name').fill(renamed)
            await dialog.getByTestId('organization-list-department-submit').click()
            await expect(dialog).toHaveCount(0)
            await expect(
              row.getByTestId(/^organization-list-department-edit-/),
            ).toHaveAccessibleName(`${renamed}を編集`)
            await check(`部署の一覧の名前が「${renamed}」になる`)
          },
        )
      })
    })

    test.describe('権限が無い職員', () => {
      test(`${prefix}職員の管理の権限を持たない職員が画面の URL を開いた場合、権限が無いことの案内が出て、部署とチームの管理の画面が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'organization-forbidden-page',
            title:
              '職員の管理の権限を持たない職員が /organization を開くと、権限が無いことの案内が出て、部署とチームの管理の画面が出ない',
            actor: LEADER_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LEADER.email)
          },
          async ({ page, step, check }) => {
            await step('/organization を開く')
            await page.goto('/organization')
            await expect(page.getByTestId('page-forbidden')).toBeVisible()
            await expect(page.getByTestId('organization-list-team-new')).toHaveCount(0)
            await expect(page.getByTestId('organization-list-department-new')).toHaveCount(0)
            await check(
              '「この画面を開く権限がありません」の案内が出て、部署とチームの一覧と作るボタンが出ない',
            )
          },
        )
      })

      test(`${prefix}職員の管理の権限を持たない職員の場合、ナビゲーションに部署とチームが無いこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'organization-forbidden-nav',
            title: '職員の管理の権限を持たない職員のナビゲーションに「部署とチーム」が無い',
            actor: LEADER_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LEADER.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            const nav = page.getByTestId('site-nav')
            await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
            await step('予定のカレンダーを開いている')

            await expect(page.getByTestId('site-nav-organization')).toHaveCount(0)
            await expect(nav).not.toContainText('部署とチーム')
            await check('ナビゲーションに「部署とチーム」が無い')
          },
        )
      })
    })
  }
})
