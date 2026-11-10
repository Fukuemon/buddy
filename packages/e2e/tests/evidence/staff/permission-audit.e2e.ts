import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  STAFF_FORM,
  addPolicy,
  issueManagerToken,
  newStaff,
  registerStaff,
} from '../../fixtures/staff'
import { openApiClient, openApiReference } from '../../screens/apiReference'
import { signInAtBroker } from '../../screens/login'
import { apiClient } from '../../selectors/apiReference'
import { staffProfileValue } from '../../selectors/staffProfile'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** シードの 1 つ目の事業所の役職のリーダー。職員の管理の権限を持たない。 */
const LEADER_POSITION = { id: '01M3TC5PVG7W2H1H20W0T1ZVEJ', name: 'リーダー' }

/** 事業所の全ての予定の閲覧（schedule.all.read）。対象を指定しない権限である。 */
const ALL_READ = { id: '01M5E1S42TTS7QZK05YGS0GYRD', code: 'schedule.all.read' }

/** 自分の予定の編集（schedule.self.edit）。 */
const SELF_EDIT_POLICY = '01M5E1S42TTS7QZK05YGS0GYR8'

/** リーダーの役職で付く権限の code。 */
const LEADER_CODES = ['schedule.self.edit', 'schedule.team.read', 'schedule.team.edit']

/** シードのチーム A の名前。STAFF_FORM.teamId のチームである。 */
const TEAM_A = 'A'

/**
 * 撮影の前に、マネージャーの API で職員を登録し、ID と名前を返す。シードの職員の権限を変えないため。
 *
 * @param label メールに入れる、観点ごとの英小文字の名前
 * @param name 画面に出る職員の名前
 * @param positionId 役職。省くとメンバーにする
 */
const registerFor = async (
  request: APIRequestContext,
  label: string,
  name: string,
  positionId?: string,
) => {
  const token = await issueManagerToken()
  const res = await registerStaff(request, token, {
    email: newStaff(label).email,
    name,
    positionId,
  })
  if (res.status() !== 201) throw new Error(`職員を登録できなかった: ${res.status()}`)
  return { token, id: ((await res.json()) as { id: string }).id, name }
}

/** 撮る画面の path を開き、ブローカーで青木としてログインして、その画面に戻る。 */
const signInAt = async (page: Page, path: string) => {
  await page.goto(path)
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 職員の詳細を開き、名前が出るまで待つ。 */
const openDetail = async (page: Page, id: string, name: string) => {
  await page.goto(`/staff/${id}`)
  await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
}

test.describe('職員の詳細', () => {
  test.describe('権限の変更の監査の記録', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}職員の管理の権限を持つ職員が職員に「事業所の全ての予定の閲覧」を足して保存した場合、権限のタブの個別の権限に出ること`, async ({
        browser,
        request,
      }) => {
        let staff = { id: '', name: '' }
        await recordPrEvidence(
          browser,
          { name: 'audit-grant-add', title: '権限を足すと記録が残る', actor: ACTOR, variant },
          async (page) => {
            staff = await registerFor(request, 'audit-grant-add', '見本 権限の追加')
            await signInAt(page, `/staff/${staff.id}`)
          },
          async ({ page, step, check }) => {
            await openDetail(page, staff.id, staff.name)
            await step(
              `${LOGIN_STAFF.name} でログインし、撮影の前に登録したメンバーの「${staff.name}」の職員の詳細を開いている`,
            )

            await step('権限のタブで「権限を変える」を押す')
            await page.getByTestId('staff-detail-tab-policies').click()
            await page.getByTestId('staff-detail-policies-change').click()
            const dialog = page.getByTestId('staff-policies-dialog')

            await step('「事業所の全ての予定の閲覧」にチェックを入れ、「保存」を押す')
            await dialog.getByTestId(`staff-policies-option-${ALL_READ.code}`).check()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog).toHaveCount(0)
            await expect(
              page
                .getByTestId('staff-policy-group-individual')
                .getByTestId(`staff-policy-row-${ALL_READ.code}`),
            ).toBeVisible()
            await check('権限のタブの個別の権限に「事業所の全ての予定の閲覧」が出る')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員が職員の「事業所の全ての予定の閲覧」を外して保存した場合、権限のタブから消えること`, async ({
        browser,
        request,
      }) => {
        let staff = { id: '', name: '' }
        await recordPrEvidence(
          browser,
          { name: 'audit-grant-remove', title: '権限を外すと記録が残る', actor: ACTOR, variant },
          async (page) => {
            const registered = await registerFor(request, 'audit-grant-remove', '見本 権限の削除')
            const added = await addPolicy(request, registered.token, registered.id, ALL_READ.id)
            if (!added.ok()) throw new Error(`権限を足せなかった: ${added.status()}`)
            staff = registered
            await signInAt(page, `/staff/${staff.id}`)
          },
          async ({ page, step, check }) => {
            await openDetail(page, staff.id, staff.name)
            await page.getByTestId('staff-detail-tab-policies').click()
            await expect(
              page
                .getByTestId('staff-policy-group-individual')
                .getByTestId(`staff-policy-row-${ALL_READ.code}`),
            ).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} でログインし、「${staff.name}」の権限のタブを開いている。撮影の前に「事業所の全ての予定の閲覧」を足してある`,
            )

            await step(
              '「権限を変える」を押し、「事業所の全ての予定の閲覧」のチェックを外して「保存」を押す',
            )
            await page.getByTestId('staff-detail-policies-change').click()
            const dialog = page.getByTestId('staff-policies-dialog')
            await dialog.getByTestId(`staff-policies-option-${ALL_READ.code}`).uncheck()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog).toHaveCount(0)
            // 消えたことを確認する前に、権限のタブが描き直されたことを、残る権限で確認する
            await expect(
              page
                .getByTestId('staff-policy-group-position')
                .getByTestId('staff-policy-row-schedule.self.edit'),
            ).toBeVisible()
            await expect(page.getByTestId(`staff-policy-row-${ALL_READ.code}`)).toHaveCount(0)
            await check('権限のタブから「事業所の全ての予定の閲覧」が消える')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ有効な職員が自分だけのときに自分の「職員の管理」を外して保存した場合、外せないことの文が出て、権限が残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'audit-last-manager-conflict',
            title: '最後の管理者の権限を外す 409 では記録が残らない',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signInAt(page, `/staff/${LOGIN_STAFF.id}`)
          },
          async ({ page, step, check }) => {
            await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
            await page.getByTestId('staff-detail-tab-policies').click()
            await expect(page.getByTestId('staff-policy-row-staff.manage')).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} でログインし、自分の権限のタブを開いている。事業所で職員の管理の権限を持つ有効な職員は ${LOGIN_STAFF.name} だけである`,
            )

            await step('「権限を変える」を押し、「職員の管理」のチェックを外して「保存」を押す')
            await page.getByTestId('staff-detail-policies-change').click()
            const dialog = page.getByTestId('staff-policies-dialog')
            await dialog.getByTestId('staff-policies-option-staff.manage').uncheck()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog.getByTestId('staff-policies-error')).toContainText(
              '職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
            )
            await check(
              'ダイアログに「職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。」が出る',
            )

            await step('「キャンセル」を押してダイアログを閉じる')
            await dialog.getByTestId('staff-policies-cancel').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-policy-row-staff.manage')).toBeVisible()
            await check('権限のタブに「職員の管理」が出ている')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員がメンバーの役職をリーダーに変えて保存した場合、詳細の役職の名前がリーダーになること`, async ({
        browser,
        request,
      }) => {
        let staff = { id: '', name: '' }
        await recordPrEvidence(
          browser,
          {
            name: 'audit-position-change',
            title: '役職を変えると前後の全量が残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            staff = await registerFor(request, 'audit-position-change', '見本 役職の変更')
            await signInAt(page, `/staff/${staff.id}`)
          },
          async ({ page, step, check }) => {
            await openDetail(page, staff.id, staff.name)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('メンバー')
            await step(
              `${LOGIN_STAFF.name} でログインし、撮影の前に登録したメンバーの「${staff.name}」の職員の詳細を開いている`,
            )

            await step(
              '「役職を変える」を押し、職員の管理の権限を持たない「リーダー」を選んで「保存」を押す',
            )
            await page.getByTestId('staff-detail-position-change').click()
            const dialog = page.getByTestId('staff-position-dialog')
            await dialog.getByTestId(`staff-position-option-${LEADER_POSITION.id}`).check()
            await dialog.getByTestId('staff-position-submit').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText(
              LEADER_POSITION.name,
            )
            await check('詳細の役職の名前が「リーダー」になる')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員がリーダーの職員の役職を今と同じリーダーに変えるリクエストを送った場合、200 が返り役職がリーダーのままであること`, async ({
        browser,
        request,
      }) => {
        let prepared = { token: '', id: '', name: '' }
        await recordPrEvidence(
          browser,
          {
            name: 'audit-position-same',
            title: '今と同じ役職に変えて権限が変わらなければ記録が残らない',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await routeApiReference(page)
            await openApiReference(page, 'schedule')
            const staff = await registerFor(
              request,
              'audit-position-same',
              '見本 同じ役職',
              LEADER_POSITION.id,
            )
            prepared = { ...staff, token: await issueAccessToken(page.request, LOGIN_EMAIL) }
          },
          async ({ page, step, check }) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', {
              tag: 'staff',
              method: 'put',
              path: '/v1/users/{user_id}/position',
            })
            await step(
              `API の参照のページで「職員の役職を変える」のリクエストを開いている。リーダーの役職のデフォルトの権限だけを持つ「${prepared.name}」を、撮影の前に登録してある`,
            )

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, prepared.token)

            await step(`「${prepared.name}」の役職を、今と同じ「リーダー」に変えるリクエストを送る`)
            await fillApiVariable(page, 'user_id', prepared.id)
            await fillApiBody(page, { position_id: LEADER_POSITION.id })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await expect(apiClient(page).dialog).toContainText('"name": "リーダー"')
            await check('200 が返り、役職は前と同じ「リーダー」のままである')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員がチームを対象にする権限を持つ職員のチームを A に変えて保存した場合、詳細のチームと権限の対象が A になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'audit-team-change',
            title: 'チームを変えて対象を移すと記録が残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signInAt(page, `/staff/${LEADER.staff.id}`)
          },
          async ({ page, step, check }) => {
            await openDetail(page, LEADER.staff.id, LEADER.staff.name)
            await page.getByTestId('staff-detail-tab-policies').click()
            await expect(page.getByTestId('staff-policy-targets-schedule.team.read')).toHaveText(
              'B',
            )
            await step(
              `${LOGIN_STAFF.name} でログインし、${LEADER.staff.name} の権限のタブを開いている。チームの予定の閲覧と編集の対象はチーム B である`,
            )

            await step('基本の情報のタブで「編集」を押し、チームを A に変えて「保存」を押す')
            await page.getByTestId('staff-detail-tab-profile').click()
            await page.getByTestId('staff-detail-edit').click()
            const dialog = page.getByTestId('staff-detail-edit-dialog')
            await dialog.getByTestId('staff-detail-team-input').selectOption(STAFF_FORM.teamId)
            await dialog.getByTestId('staff-detail-save').click()
            await expect(dialog).toHaveCount(0)
            await expect(staffProfileValue(page, 'チーム')).toHaveText(TEAM_A)
            await check('詳細のチームが A になる')

            await step('権限のタブを開く')
            await page.getByTestId('staff-detail-tab-policies').click()
            await expect(page.getByTestId('staff-policy-targets-schedule.team.read')).toHaveText(
              TEAM_A,
            )
            await expect(page.getByTestId('staff-policy-targets-schedule.team.edit')).toHaveText(
              TEAM_A,
            )
            await check('チームの予定の閲覧と編集の対象が A になる')
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員がチームを対象にする権限を持つ職員の名前だけを変えて保存した場合、詳細の名前が変えた名前になること`, async ({
        browser,
      }) => {
        const renamed = `${LEADER.staff.name} 改`
        await recordPrEvidence(
          browser,
          {
            name: 'audit-name-only',
            title: '名前だけを変えると記録が残らない',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signInAt(page, `/staff/${LEADER.staff.id}`)
          },
          async ({ page, step, check }) => {
            await page.goto(`/staff/${LEADER.staff.id}`)
            await expect(page.getByTestId('staff-detail-name')).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} でログインし、チームを対象にする権限を持つ ${LEADER.staff.name} の職員の詳細を開いている`,
            )

            await step(`「編集」を押し、名前だけを「${renamed}」に変えて「保存」を押す`)
            await page.getByTestId('staff-detail-edit').click()
            const dialog = page.getByTestId('staff-detail-edit-dialog')
            await dialog.getByTestId('staff-detail-name-input').fill(renamed)
            await dialog.getByTestId('staff-detail-save').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-name')).toHaveText(renamed)
            await check(`詳細の名前が「${renamed}」になる`)
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員が役職をリーダーにして職員を登録した場合、登録した職員の詳細が開き、権限のタブに役職の権限が出ること`, async ({
        browser,
      }) => {
        const staff = { ...newStaff('audit-staff-create'), name: '見本 職員の登録' }
        await recordPrEvidence(
          browser,
          {
            name: 'audit-staff-create',
            title: '職員を登録するとデフォルトの権限が after に残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signInAt(page, '/staff')
          },
          async ({ page, step, check }) => {
            await page.goto('/staff')
            await expect(page.getByTestId('staff-list-table')).toBeVisible()
            await step(`${LOGIN_STAFF.name} でログインし、職員の一覧を開いている`)

            await step(
              `「職員を登録」を押し、名前「${staff.name}」とメールを入れ、役職を「リーダー」にして登録する`,
            )
            await page.getByTestId('staff-list-new').click()
            const dialog = page.getByTestId('staff-new-dialog')
            await dialog.getByTestId('staff-new-name').fill(staff.name)
            await dialog.getByTestId('staff-new-email').fill(staff.email)
            await dialog.getByTestId('staff-new-position').selectOption(LEADER_POSITION.id)
            await dialog.getByTestId('staff-new-submit').click()
            await expect(page).toHaveURL(/\/staff\/[0-9A-HJKMNP-TV-Z]{26}$/)
            await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
            await check(`登録した「${staff.name}」の職員の詳細が開く`)

            await step('権限のタブを開く')
            await page.getByTestId('staff-detail-tab-policies').click()
            const group = page.getByTestId('staff-policy-group-position')
            for (const code of LEADER_CODES) {
              await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
            }
            await check(
              '役職の権限として「自分の予定の編集」「指定したチームの職員の予定の閲覧」「指定したチームの職員の予定の編集」が出る',
            )
          },
        )
      })

      test(`${prefix}職員の管理の権限を持つ職員が名前「主任」と権限「自分の予定の編集」で役職を作るリクエストを送った場合、201 で作った役職が返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'audit-position-create',
            title: '役職を作ると名前とデフォルトの権限が残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await routeApiReference(page)
            await openApiReference(page, 'schedule')
            return issueAccessToken(page.request, LOGIN_EMAIL)
          },
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', {
              tag: 'organization',
              method: 'post',
              path: '/v1/facilities/{facility_id}/positions',
            })
            await step('API の参照のページで「役職を作る」のリクエストを開いている')

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step('名前「主任」と権限「自分の予定の編集」で、役職を作るリクエストを送る')
            await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
            await fillApiBody(page, { name: '主任', policy_ids: [SELF_EDIT_POLICY] })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('201 Created')
            await expect(apiClient(page).dialog).toContainText('"name": "主任"')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.self.edit"')
            await check(
              '201 が返り、名前「主任」と権限「自分の予定の編集」（schedule.self.edit）が出る',
            )
          },
        )
      })
    }
  })
})
