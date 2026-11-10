// DB を作り直してから単独で流す。audit-position-create が作る役職「主任」は、役職を消す API が無く戻せない
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LOGIN_STAFF, LOGIN_STATE, SCHEDULE_URL } from '../../fixtures/env'
import {
  STAFF_FORM,
  addPolicy,
  issueManagerToken,
  newStaff,
  registerStaff,
} from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'
import { staffProfileValue } from '../../selectors/staffProfile'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  scrollApiResponseTo,
} from '../../widgets/apiClient/actions/apiClient'

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

/** 職員の詳細を開き、名前が出るまで待つ。 */
const openDetail = async (page: Page, id: string, name: string) => {
  await page.goto(`/staff/${id}`)
  await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
}

/**
 * 職員 id の名前、部署、チーム、訪問するか、電話番号を読み、その値に戻す関数を返す。
 * シードの職員を変える観点で、ほかの撮影の前提に戻すために、撮った後に呼ぶ。
 */
const keepProfile = async (request: APIRequestContext, id: string) => {
  const token = await issueManagerToken()
  const headers = { Authorization: `Bearer ${token}` }
  const res = await request.get(`${SCHEDULE_URL}/v1/users/${id}`, { headers })
  if (!res.ok()) throw new Error(`職員を読めない: ${res.status()}`)
  const staff = (await res.json()) as {
    username: string
    department: { id: string }
    team: { id: string }
    visits: boolean
    phone_number: string | null
  }
  return async () => {
    const put = await request.put(`${SCHEDULE_URL}/v1/users/${id}`, {
      headers,
      data: {
        username: staff.username,
        department_id: staff.department.id,
        team_id: staff.team.id,
        visits: staff.visits,
        phone_number: staff.phone_number,
      },
    })
    if (!put.ok()) throw new Error(`職員を戻せない: ${put.status()}`)
  }
}

/** 録画する page で、API の参照のページの path のリクエストを開く。 */
const openRequest = async (page: Page, o: { tag: string; method: string; path: string }) => {
  await routeApiReference(page)
  await openApiClient(page, 'schedule', o)
}

test.describe('職員の詳細', () => {
  test.describe('権限の変更の監査の記録', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
      test.use({ storageState: LOGIN_STATE })

      test('audit-grant-add 職員の管理の権限を持つ職員が職員に「事業所の全ての予定の閲覧」を足して保存した場合、権限のタブの個別の権限に出ること', async ({
        context,
        request,
      }) => {
        const staff = await registerFor(request, 'audit-grant-add', '見本 権限の追加')

        const page = await context.newPage()
        await openDetail(page, staff.id, staff.name)
        await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
        await intro(
          page,
          `権限を足すと記録が残る\n前提 ${LOGIN_STAFF.name} でログインし、撮影の前に登録したメンバーの「${staff.name}」の職員の詳細を開いている`,
        )

        const dialog = page.getByTestId('staff-policies-dialog')
        await step(page, '権限のタブで「権限を変える」を押す', async () => {
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
        })
        await step(
          page,
          '「事業所の全ての予定の閲覧」にチェックを入れ、「保存」を押す',
          async () => {
            await dialog.getByTestId(`staff-policies-option-${ALL_READ.code}`).check()
            await dialog.getByTestId('staff-policies-submit').click()
          },
        )
        await check(
          page,
          '権限のタブの個別の権限に「事業所の全ての予定の閲覧」が出る',
          async () => {
            await expect(dialog).toHaveCount(0)
            await expect(
              page
                .getByTestId('staff-policy-group-individual')
                .getByTestId(`staff-policy-row-${ALL_READ.code}`),
            ).toBeVisible()
          },
        )
      })

      test('audit-grant-remove 職員の管理の権限を持つ職員が職員の「事業所の全ての予定の閲覧」を外して保存した場合、権限のタブから消えること', async ({
        context,
        request,
      }) => {
        const staff = await registerFor(request, 'audit-grant-remove', '見本 権限の削除')
        const added = await addPolicy(request, staff.token, staff.id, ALL_READ.id)
        if (!added.ok()) throw new Error(`権限を足せなかった: ${added.status()}`)

        const page = await context.newPage()
        await openDetail(page, staff.id, staff.name)
        await page.getByTestId('staff-detail-tab-policies').click()
        const individual = page
          .getByTestId('staff-policy-group-individual')
          .getByTestId(`staff-policy-row-${ALL_READ.code}`)
        await expect(individual).toBeVisible()
        await intro(
          page,
          `権限を外すと記録が残る\n前提 ${LOGIN_STAFF.name} でログインし、「${staff.name}」の権限のタブを開いている。撮影の前に「事業所の全ての予定の閲覧」を足してある`,
        )

        const dialog = page.getByTestId('staff-policies-dialog')
        await step(
          page,
          '「権限を変える」を押し、「事業所の全ての予定の閲覧」のチェックを外して「保存」を押す',
          async () => {
            await page.getByTestId('staff-detail-policies-change').click()
            await dialog.getByTestId(`staff-policies-option-${ALL_READ.code}`).uncheck()
            await dialog.getByTestId('staff-policies-submit').click()
          },
        )
        await check(page, '権限のタブから「事業所の全ての予定の閲覧」が消える', async () => {
          await expect(dialog).toHaveCount(0)
          // 消えたことを確認する前に、権限のタブが描き直されたことを、残る権限で確認する
          await expect(
            page
              .getByTestId('staff-policy-group-position')
              .getByTestId('staff-policy-row-schedule.self.edit'),
          ).toBeVisible()
          await expect(page.getByTestId(`staff-policy-row-${ALL_READ.code}`)).toHaveCount(0)
        })
      })

      test('audit-last-manager-conflict 職員の管理の権限を持つ有効な職員が自分だけのときに自分の「職員の管理」を外して保存した場合、外せないことの文が出て、権限が残ること', async ({
        page,
      }) => {
        await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
        await page.getByTestId('staff-detail-tab-policies').click()
        await expect(page.getByTestId('staff-policy-row-staff.manage')).toBeVisible()
        await intro(
          page,
          `最後の管理者の権限を外す 409 では記録が残らない\n前提 ${LOGIN_STAFF.name} でログインし、自分の権限のタブを開いている。事業所で職員の管理の権限を持つ有効な職員は ${LOGIN_STAFF.name} だけである`,
        )

        const dialog = page.getByTestId('staff-policies-dialog')
        await step(
          page,
          '「権限を変える」を押し、「職員の管理」のチェックを外して「保存」を押す',
          async () => {
            await page.getByTestId('staff-detail-policies-change').click()
            await dialog.getByTestId('staff-policies-option-staff.manage').uncheck()
            await dialog.getByTestId('staff-policies-submit').click()
          },
        )
        await check(
          page,
          'ダイアログに「職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。」が出る',
          () =>
            expect(dialog.getByTestId('staff-policies-error')).toContainText(
              '職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
            ),
        )

        await step(page, '「キャンセル」を押してダイアログを閉じる', async () => {
          await dialog.getByTestId('staff-policies-cancel').click()
          await expect(dialog).toHaveCount(0)
        })
        await check(page, '権限のタブに「職員の管理」が出ている', () =>
          expect(page.getByTestId('staff-policy-row-staff.manage')).toBeVisible(),
        )
      })

      test('audit-position-change 職員の管理の権限を持つ職員がメンバーの役職をリーダーに変えて保存した場合、詳細の役職の名前がリーダーになること', async ({
        context,
        request,
      }) => {
        const staff = await registerFor(request, 'audit-position-change', '見本 役職の変更')

        const page = await context.newPage()
        await openDetail(page, staff.id, staff.name)
        await expect(page.getByTestId('staff-detail-position-name')).toHaveText('メンバー')
        await intro(
          page,
          `役職を変えると前後の全量が残る\n前提 ${LOGIN_STAFF.name} でログインし、撮影の前に登録したメンバーの「${staff.name}」の職員の詳細を開いている`,
        )

        const dialog = page.getByTestId('staff-position-dialog')
        await step(
          page,
          '「役職を変える」を押し、職員の管理の権限を持たない「リーダー」を選んで「保存」を押す',
          async () => {
            await page.getByTestId('staff-detail-position-change').click()
            await dialog.getByTestId(`staff-position-option-${LEADER_POSITION.id}`).check()
            await dialog.getByTestId('staff-position-submit').click()
          },
        )
        await check(page, '詳細の役職の名前が「リーダー」になる', async () => {
          await expect(dialog).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-position-name')).toHaveText(
            LEADER_POSITION.name,
          )
        })
      })

      test('audit-position-same 職員の管理の権限を持つ職員がリーダーの職員の役職を今と同じリーダーに変えるリクエストを送った場合、200 が返り役職がリーダーのままであること', async ({
        context,
        request,
      }) => {
        const staff = await registerFor(
          request,
          'audit-position-same',
          '見本 同じ役職',
          LEADER_POSITION.id,
        )

        const page = await context.newPage()
        await openRequest(page, {
          tag: 'staff',
          method: 'put',
          path: '/v1/users/{user_id}/position',
        })
        await expect(apiClient(page).dialog).toBeVisible()
        await intro(
          page,
          `今と同じ役職に変えて権限が変わらなければ記録が残らない\n前提 API の参照のページで「職員の役職を変える」のリクエストを開いている。リーダーの役職のデフォルトの権限だけを持つ「${staff.name}」を、撮影の前に登録してある`,
        )

        await step(page, `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`, () =>
          fillApiToken(page, staff.token),
        )
        await step(
          page,
          `「${staff.name}」の役職を、今と同じ「リーダー」に変えるリクエストを送る`,
          async () => {
            await fillApiVariable(page, 'user_id', staff.id)
            await fillApiBody(page, { position_id: LEADER_POSITION.id })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await scrollApiResponseTo(page, '"name": "リーダー"')
          },
        )
        await check(page, '200 が返り、役職は前と同じ「リーダー」のままである', async () => {
          await expect(apiClient(page).dialog).toContainText('200 OK')
          await expect(apiClient(page).dialog).toContainText('"name": "リーダー"')
        })
      })

      test('audit-team-change 職員の管理の権限を持つ職員がチームを対象にする権限を持つ職員のチームを A に変えて保存した場合、詳細のチームと権限の対象が A になること', async ({
        page,
        request,
      }) => {
        const restore = await keepProfile(request, LEADER.staff.id)
        try {
          await openDetail(page, LEADER.staff.id, LEADER.staff.name)
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-policy-targets-schedule.team.read')).toHaveText('B')
          await intro(
            page,
            `チームを変えて対象を移すと記録が残る\n前提 ${LOGIN_STAFF.name} でログインし、${LEADER.staff.name} の権限のタブを開いている。チームの予定の閲覧と編集の対象はチーム B である`,
          )

          const dialog = page.getByTestId('staff-detail-edit-dialog')
          await step(
            page,
            '基本の情報のタブで「編集」を押し、チームを A に変えて「保存」を押す',
            async () => {
              await page.getByTestId('staff-detail-tab-profile').click()
              await page.getByTestId('staff-detail-edit').click()
              await dialog.getByTestId('staff-detail-team-input').selectOption(STAFF_FORM.teamId)
              await dialog.getByTestId('staff-detail-save').click()
            },
          )
          await check(page, '詳細のチームが A になる', async () => {
            await expect(dialog).toHaveCount(0)
            await expect(staffProfileValue(page, 'チーム')).toHaveText(TEAM_A)
          })

          await step(page, '権限のタブを開く', () =>
            page.getByTestId('staff-detail-tab-policies').click(),
          )
          await check(page, 'チームの予定の閲覧と編集の対象が A になる', async () => {
            await expect(page.getByTestId('staff-policy-targets-schedule.team.read')).toHaveText(
              TEAM_A,
            )
            await expect(page.getByTestId('staff-policy-targets-schedule.team.edit')).toHaveText(
              TEAM_A,
            )
          })
        } finally {
          await restore()
        }
      })

      test('audit-name-only 職員の管理の権限を持つ職員がチームを対象にする権限を持つ職員の名前だけを変えて保存した場合、詳細の名前が変えた名前になること', async ({
        page,
        request,
      }) => {
        const restore = await keepProfile(request, LEADER.staff.id)
        try {
          const renamed = `${LEADER.staff.name} 改`
          await page.goto(`/staff/${LEADER.staff.id}`)
          await expect(page.getByTestId('staff-detail-name')).toBeVisible()
          await intro(
            page,
            `名前だけを変えると記録が残らない\n前提 ${LOGIN_STAFF.name} でログインし、チームを対象にする権限を持つ ${LEADER.staff.name} の職員の詳細を開いている`,
          )

          const dialog = page.getByTestId('staff-detail-edit-dialog')
          await step(
            page,
            `「編集」を押し、名前だけを「${renamed}」に変えて「保存」を押す`,
            async () => {
              await page.getByTestId('staff-detail-edit').click()
              await dialog.getByTestId('staff-detail-name-input').fill(renamed)
              await dialog.getByTestId('staff-detail-save').click()
            },
          )
          await check(page, `詳細の名前が「${renamed}」になる`, async () => {
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-name')).toHaveText(renamed)
          })
        } finally {
          await restore()
        }
      })

      test('audit-staff-create 職員の管理の権限を持つ職員が役職をリーダーにして職員を登録した場合、登録した職員の詳細が開き、権限のタブに役職の権限が出ること', async ({
        page,
      }) => {
        const staff = { ...newStaff('audit-staff-create'), name: '見本 職員の登録' }
        await page.goto('/staff')
        await expect(page.getByTestId('staff-list-table')).toBeVisible()
        await intro(
          page,
          `職員を登録するとデフォルトの権限が after に残る\n前提 ${LOGIN_STAFF.name} でログインし、職員の一覧を開いている`,
        )

        await step(
          page,
          `「職員を登録」を押し、名前「${staff.name}」とメールを入れ、役職を「リーダー」にして登録する`,
          async () => {
            await page.getByTestId('staff-list-new').click()
            const dialog = page.getByTestId('staff-new-dialog')
            await dialog.getByTestId('staff-new-name').fill(staff.name)
            await dialog.getByTestId('staff-new-email').fill(staff.email)
            await dialog.getByTestId('staff-new-position').selectOption(LEADER_POSITION.id)
            await dialog.getByTestId('staff-new-submit').click()
          },
        )
        await check(page, `登録した「${staff.name}」の職員の詳細が開く`, async () => {
          await expect(page).toHaveURL(/\/staff\/[0-9A-HJKMNP-TV-Z]{26}$/)
          await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
        })

        await step(page, '権限のタブを開く', () =>
          page.getByTestId('staff-detail-tab-policies').click(),
        )
        const group = page.getByTestId('staff-policy-group-position')
        await check(
          page,
          '役職の権限として「自分の予定の編集」「指定したチームの職員の予定の閲覧」「指定したチームの職員の予定の編集」が出る',
          async () => {
            for (const code of LEADER_CODES) {
              await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
            }
          },
        )
      })

      test('audit-position-create 職員の管理の権限を持つ職員が名前「主任」と権限「自分の予定の編集」で役職を作るリクエストを送った場合、201 で作った役職が返ること', async ({
        context,
      }) => {
        const token = await issueManagerToken()

        const page = await context.newPage()
        await openRequest(page, {
          tag: 'organization',
          method: 'post',
          path: '/v1/facilities/{facility_id}/positions',
        })
        await expect(apiClient(page).dialog).toBeVisible()
        await intro(
          page,
          '役職を作ると名前とデフォルトの権限が残る\n前提 API の参照のページで「役職を作る」のリクエストを開いている',
        )

        await step(page, `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`, () =>
          fillApiToken(page, token),
        )
        await step(
          page,
          '名前「主任」と権限「自分の予定の編集」で、役職を作るリクエストを送る',
          async () => {
            await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
            await fillApiBody(page, { name: '主任', policy_ids: [SELF_EDIT_POLICY] })
            await apiClient(page).send.click()
          },
        )
        await check(
          page,
          '201 が返り、名前「主任」と権限「自分の予定の編集」（schedule.self.edit）が出る',
          async () => {
            await expect(apiClient(page).dialog).toContainText('201 Created')
            await expect(apiClient(page).dialog).toContainText('"name": "主任"')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.self.edit"')
          },
        )
      })
    })
  })
})
