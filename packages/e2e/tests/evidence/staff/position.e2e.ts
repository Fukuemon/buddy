import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LOGIN_STAFF, LOGIN_STATE, SCHEDULE_URL } from '../../fixtures/env'
import {
  STAFF_FORM,
  STAFF_MANAGE_CODE,
  issueManagerToken,
  newStaff,
  removePolicy,
} from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  scrollApiResponseTo,
} from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

const TEAM_A = STAFF_FORM.teamId
const TEAM_B = '01M3TC5MX04QJ19X6XR1ZCBZRJ'
const LEADER_POSITION = '01M3TC5PVG7W2H1H20W0T1ZVEJ'
/** シードの 1 つ目の事業所の役職の管理者。職員の管理の権限を持つ。 */
const MANAGER_POSITION = '01M3TC5NW8G8HN54GZ984344PZ'
/** シードの 1 つ目の事業所の役職のメンバー。 */
const MEMBER_POSITION = STAFF_FORM.positionId

/** 指定した職員の予定の閲覧（schedule.user.read）。 */
const USER_READ = { id: '01M5E1S42TTS7QZK05YGS0GYR9', code: 'schedule.user.read' }
/** 指定したチームの職員の予定の閲覧（schedule.team.read）。 */
const TEAM_READ = { id: '01M5E1S42TTS7QZK05YGS0GYRB', code: 'schedule.team.read' }
/** 指定したチームの職員の予定の編集（schedule.team.edit）。 */
const TEAM_EDIT = { id: '01M5E1S42TTS7QZK05YGS0GYRC', code: 'schedule.team.edit' }
const SELF_EDIT_CODE = 'schedule.self.edit'

/** 撮影の前に登録する職員の名前。仮の名前にする。 */
const STAFF_NAME = '見本 職員'

type Grant = { user_policy_id: string; policy_id: string }

/** 予定の API で、チームと役職を指定して職員を登録し、ID と付いた権限を返す。シードの職員の権限を変えないため。 */
const registerIn = async (
  request: APIRequestContext,
  token: string,
  o: { label: string; teamId: string; positionId: string },
) => {
  const res = await request.post(`${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username: STAFF_NAME,
      email: newStaff(o.label).email,
      department_id: STAFF_FORM.departmentId,
      team_id: o.teamId,
      position_id: o.positionId,
    },
  })
  if (res.status() !== 201)
    throw new Error(`職員を登録できない: ${res.status()} ${await res.text()}`)
  return (await res.json()) as { id: string; policies: Grant[] }
}

/** 職員に、対象を指定する権限を足す（POST /v1/users/{user_id}/policies）。 */
const addTargetedPolicy = async (
  request: APIRequestContext,
  token: string,
  userId: string,
  data: { policy_id: string; target_user_ids?: string[]; target_team_ids?: string[] },
) => {
  const res = await request.post(`${SCHEDULE_URL}/v1/users/${userId}/policies`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  })
  if (!res.ok()) throw new Error(`権限を足せない: ${res.status()} ${await res.text()}`)
}

/** 登録したリーダーの「指定したチームの職員の予定の閲覧」を外し、対象をチーム A と B にして足し直す。 */
const retargetTeamReadToAB = async (
  request: APIRequestContext,
  token: string,
  staff: { id: string; policies: Grant[] },
) => {
  const grant = staff.policies.find((p) => p.policy_id === TEAM_READ.id)
  if (grant === undefined) throw new Error('リーダーに指定したチームの職員の予定の閲覧が無い')
  const removed = await removePolicy(request, token, staff.id, grant.user_policy_id)
  if (!removed.ok()) throw new Error(`権限を外せない: ${removed.status()}`)
  await addTargetedPolicy(request, token, staff.id, {
    policy_id: TEAM_READ.id,
    target_team_ids: [TEAM_A, TEAM_B],
  })
}

/** 職員の詳細を開き、名前が出るまで待つ。 */
const openDetail = async (page: Page, id: string, name: string) => {
  await page.goto(`/staff/${id}`)
  await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
}

/** プロフィールの「役職を変える」を開き、positionId の役職を選んで保存を押す。役職を変えるダイアログを返す。 */
const submitPosition = async (page: Page, positionId: string) => {
  await page.getByTestId('staff-detail-position-change').click()
  const dialog = page.getByTestId('staff-position-dialog')
  await dialog.getByTestId(`staff-position-option-${positionId}`).check()
  await dialog.getByTestId('staff-position-submit').click()
  return dialog
}

/** 「役職を変える」から positionName の役職を選んで保存し、ダイアログが閉じて役職の名前が変わるまで待つ。 */
const changePosition = (page: Page, positionId: string, positionName: string) =>
  step(page, `「役職を変える」から「${positionName}」を選んで保存する`, async () => {
    const dialog = await submitPosition(page, positionId)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('staff-detail-position-name')).toHaveText(positionName)
  })

/** 権限のタブを開き、権限の一覧が出るまで待つ。 */
const openPoliciesTab = (page: Page) =>
  step(page, '権限のタブを開く', async () => {
    await page.getByTestId('staff-detail-tab-policies').click()
    await expect(page.getByTestId('staff-policy-list')).toBeVisible()
  })

/** 録画する page で、API の参照のページの「職員の役職を変える」のリクエストを開く。 */
const openPositionRequest = async (page: Page) => {
  await routeApiReference(page)
  await openApiClient(page, 'schedule', {
    tag: 'staff',
    method: 'put',
    path: '/v1/users/{user_id}/position',
  })
}

test.describe('職員の管理', () => {
  test.describe('職員の役職', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
      test.use({ storageState: LOGIN_STATE })

      test('staff-position-change メンバーの役職をリーダーに変えた場合、役職と権限がリーダーのデフォルトになること', async ({
        context,
        request,
      }) => {
        // 録画の外で、役職を変える相手のメンバーの職員を作る。シードの職員の権限を変えないため
        const token = await issueManagerToken()
        const { id: userId } = await registerIn(request, token, {
          label: 'position-api',
          teamId: TEAM_B,
          positionId: MEMBER_POSITION,
        })

        const page = await context.newPage()
        await openPositionRequest(page)
        await expect(apiClient(page).dialog).toBeVisible()
        await intro(
          page,
          'メンバーの役職をリーダーに変えると、役職と権限がリーダーのデフォルトになる\n前提 API の参照のページで「職員の役職を変える」のリクエストを開いている。チーム B のメンバーの「見本 職員」を、撮影の前に作ってある',
        )

        await step(page, `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`, () =>
          fillApiToken(page, token),
        )
        await step(page, '「見本 職員」の役職をリーダーに変えるリクエストを送る', async () => {
          await fillApiVariable(page, 'user_id', userId)
          await fillApiBody(page, { position_id: LEADER_POSITION })
          await apiClient(page).send.click()
        })
        await check(
          page,
          '200 が返り、役職がリーダーになり、権限がリーダーのデフォルト（自分の予定の編集、チームの予定の閲覧と編集）になる',
          async () => {
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await expect(apiClient(page).dialog).toContainText('"name": "リーダー"')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.team.edit"')
          },
        )
      })

      // 個別に足した権限のまとまりは、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は両方の版で通る役職のデフォルトだけを見る
      test(
        'position-keep-individual 指定した職員の予定の閲覧を個別に足したメンバーの役職をリーダーに変えた場合、個別に足した権限が残ること',
        { tag: '@compare' },
        async ({ context, request }) => {
          const token = await issueManagerToken()
          const staff = await registerIn(request, token, {
            label: 'position-keep-individual',
            teamId: TEAM_A,
            positionId: MEMBER_POSITION,
          })
          await addTargetedPolicy(request, token, staff.id, {
            policy_id: USER_READ.id,
            target_user_ids: [LEADER.staff.id],
          })

          const page = await context.newPage()
          await openDetail(page, staff.id, STAFF_NAME)
          await expect(page.getByTestId('staff-detail-name')).toHaveText(STAFF_NAME)
          await intro(
            page,
            `個別に足した権限が役職を変えても残る\n前提 「指定した職員の予定の閲覧」（${LEADER.staff.name}）を個別に足したメンバーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
          )

          await changePosition(page, LEADER_POSITION, 'リーダー')
          await openPoliciesTab(page)
          const position = page.getByTestId('staff-policy-group-position')
          await check(
            page,
            `役職の名前が「リーダー」になり、権限のタブの「役職「リーダー」で付く権限」に 3 つの権限が、「個別に足した権限」に「指定した職員の予定の閲覧」と対象の「${LEADER.staff.name}」が出る`,
            async () => {
              await expect(position).toContainText('役職「リーダー」で付く権限')
              await expect(position.getByTestId(/^staff-policy-row-/)).toHaveCount(3)
            },
          )
        },
      )

      // チームの予定の編集の対象は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は両方の版で通るチームの予定の閲覧の対象だけを見る
      test(
        'position-overlap-keeps-target チーム B を対象にするチームの予定の編集を個別に足したチーム A のメンバーの役職をリーダーに変えた場合、チームの予定の編集の対象が B のまま残ること',
        { tag: '@compare' },
        async ({ context, request }) => {
          const token = await issueManagerToken()
          const staff = await registerIn(request, token, {
            label: 'position-overlap-keeps-target',
            teamId: TEAM_A,
            positionId: MEMBER_POSITION,
          })
          await addTargetedPolicy(request, token, staff.id, {
            policy_id: TEAM_EDIT.id,
            target_team_ids: [TEAM_B],
          })

          const page = await context.newPage()
          await openDetail(page, staff.id, STAFF_NAME)
          await expect(page.getByTestId('staff-detail-name')).toHaveText(STAFF_NAME)
          await intro(
            page,
            `新しい役職のデフォルトにもある個別の権限は対象が残る\n前提 チーム B を対象にする「チームの予定の編集」を個別に足した、チーム A のメンバーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
          )

          await changePosition(page, LEADER_POSITION, 'リーダー')
          await openPoliciesTab(page)
          const position = page.getByTestId('staff-policy-group-position')
          await check(
            page,
            '権限のタブの「役職「リーダー」で付く権限」の「チームの予定の編集」の対象に「B」だけが出て、「A」は出ない。「チームの予定の閲覧」の対象には「A」が出る',
            async () => {
              await expect(position).toContainText('役職「リーダー」で付く権限')
              await expect(
                position.getByTestId(`staff-policy-targets-${TEAM_READ.code}`),
              ).toHaveText('A')
            },
          )
        },
      )

      // レスポンスの target_team_ids は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は両方の版で通る 200 だけを見る
      test(
        'position-same-keeps-targets チームの予定の閲覧の対象を A と B に直したチーム A のリーダーを API で同じリーダーに変えた場合、200 が返り、対象が A と B のまま残ること',
        { tag: '@compare' },
        async ({ context, request }) => {
          const token = await issueManagerToken()
          const staff = await registerIn(request, token, {
            label: 'position-same-keeps-targets',
            teamId: TEAM_A,
            positionId: LEADER_POSITION,
          })
          await retargetTeamReadToAB(request, token, staff)

          const page = await context.newPage()
          await openPositionRequest(page)
          await expect(apiClient(page).dialog).toBeVisible()
          await intro(
            page,
            `同じ役職に変えると職員ごとに直した対象が残る\n前提 API の参照のページで「職員の役職を変える」のリクエストを開いている。チーム A のリーダーの「${STAFF_NAME}」を撮影の前に登録し、「チームの予定の閲覧」の対象を A と B に直してある`,
          )

          await step(
            page,
            `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`,
            () => fillApiToken(page, token),
          )
          await step(
            page,
            `「${STAFF_NAME}」を今と同じ「リーダー」に変えるリクエストを送る`,
            async () => {
              await fillApiVariable(page, 'user_id', staff.id)
              await fillApiBody(page, { position_id: LEADER_POSITION })
              await apiClient(page).send.click()
              await expect(apiClient(page).dialog).toContainText('200 OK')
              await scrollApiResponseTo(page, `"code": "${TEAM_READ.code}"`)
            },
          )
          await check(
            page,
            '200 が返り、レスポンスの「チームの予定の閲覧」の target_team_ids に A と B の 2 つの ID が出る',
            () => expect(apiClient(page).dialog).toContainText('200 OK'),
          )
        },
      )

      test('position-default-replaced チームの予定の閲覧の対象を A と B に直したチーム A のリーダーの役職をメンバーに変えた場合、前の役職のデフォルトの権限が消えること', async ({
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = await registerIn(request, token, {
          label: 'position-default-replaced',
          teamId: TEAM_A,
          positionId: LEADER_POSITION,
        })
        await retargetTeamReadToAB(request, token, staff)

        const page = await context.newPage()
        await openDetail(page, staff.id, STAFF_NAME)
        await expect(page.getByTestId('staff-detail-name')).toHaveText(STAFF_NAME)
        await intro(
          page,
          `前の役職のデフォルトの権限は対象を直していても消える\n前提 「チームの予定の閲覧」の対象を A と B に直した、チーム A のリーダーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
        )

        await changePosition(page, MEMBER_POSITION, 'メンバー')
        await openPoliciesTab(page)
        const list = page.getByTestId('staff-policy-list')
        await check(
          page,
          '役職の名前が「メンバー」になり、権限のタブに「自分の予定の編集」だけが出て、「チームの予定の閲覧」と「チームの予定の編集」は出ない',
          async () => {
            await expect(list.getByTestId(`staff-policy-row-${SELF_EDIT_CODE}`)).toBeVisible()
            await expect(list.getByTestId(/^staff-policy-row-/)).toHaveCount(1)
            await expect(list.getByTestId(`staff-policy-row-${TEAM_READ.code}`)).toHaveCount(0)
            await expect(list.getByTestId(`staff-policy-row-${TEAM_EDIT.code}`)).toHaveCount(0)
          },
        )
      })

      test('position-team-target チーム B のメンバーの役職をリーダーに変えた場合、チームの権限の対象が所属のチーム B になること', async ({
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = await registerIn(request, token, {
          label: 'position-team-target',
          teamId: TEAM_B,
          positionId: MEMBER_POSITION,
        })

        const page = await context.newPage()
        await openDetail(page, staff.id, STAFF_NAME)
        await expect(page.getByTestId('staff-detail-name')).toHaveText(STAFF_NAME)
        await intro(
          page,
          `新しい役職のチームの権限が所属のチームを対象にする\n前提 チーム B のメンバーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
        )

        await changePosition(page, LEADER_POSITION, 'リーダー')
        await openPoliciesTab(page)
        const position = page.getByTestId('staff-policy-group-position')
        await check(
          page,
          '権限のタブの「チームの予定の閲覧」と「チームの予定の編集」の対象に「B」が出る',
          async () => {
            await expect(position.getByTestId(`staff-policy-targets-${TEAM_READ.code}`)).toHaveText(
              'B',
            )
            await expect(position.getByTestId(`staff-policy-targets-${TEAM_EDIT.code}`)).toHaveText(
              'B',
            )
          },
        )
      })

      // 青木が最後の有効な管理者である前提で撮るので、管理者を登録する position-manager-change-ok より前に置く
      test('position-last-manager-conflict 事業所で唯一の有効な管理者の役職を職員の管理の権限の無いリーダーに変えた場合、拒まれて役職と権限が変わらないこと', async ({
        page,
      }) => {
        await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
        await expect(page.getByTestId('staff-detail-name')).toHaveText(LOGIN_STAFF.name)
        await intro(
          page,
          `最後の有効な管理者を職員の管理の権限の無い役職に変えると拒まれる\n前提 職員の管理の権限を役職のデフォルトだけで持つ、事業所で唯一の有効な管理者の「${LOGIN_STAFF.name}」の職員の詳細を開いている（シードのまま）`,
        )

        const dialog = page.getByTestId('staff-position-dialog')
        await step(page, '「役職を変える」から「リーダー」を選んで保存する', async () => {
          await submitPosition(page, LEADER_POSITION)
        })
        await check(
          page,
          'ダイアログが閉じず、フッターに「職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。」が出る',
          async () => {
            await expect(dialog.getByTestId('staff-position-error')).toHaveText(
              '職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。',
            )
            await expect(dialog).toBeVisible()
          },
        )

        await step(page, 'ダイアログを閉じ、権限のタブを開く', async () => {
          await dialog.getByTestId('staff-position-cancel').click()
          await expect(dialog).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-position-name')).toHaveText('管理者')
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-policy-list')).toBeVisible()
        })
        await check(
          page,
          '役職の名前は「管理者」で、権限のタブに「職員の管理」が出る',
          async () => {
            await expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE_CODE}`)).toBeVisible()
          },
        )
      })

      test('position-manager-change-ok ほかに有効な管理者がいる管理者の役職を職員の管理の権限の無いリーダーに変えた場合、役職がリーダーになり職員の管理の権限が消えること', async ({
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = await registerIn(request, token, {
          label: 'position-manager-change-ok',
          teamId: TEAM_A,
          positionId: MANAGER_POSITION,
        })

        const page = await context.newPage()
        await openDetail(page, staff.id, STAFF_NAME)
        await expect(page.getByTestId('staff-detail-position-name')).toHaveText('管理者')
        await intro(
          page,
          `ほかに有効な管理者がいれば職員の管理の権限の無い役職に変えられる\n前提 撮影の前に API で登録した管理者の「${STAFF_NAME}」の職員の詳細を開いている。${LOGIN_STAFF.name} もほかの有効な管理者である`,
        )

        await changePosition(page, LEADER_POSITION, 'リーダー')
        await openPoliciesTab(page)
        const list = page.getByTestId('staff-policy-list')
        await check(
          page,
          'ダイアログが閉じ、役職の名前が「リーダー」になり、権限のタブに「職員の管理」が出ない',
          async () => {
            await expect(list.getByTestId(`staff-policy-row-${SELF_EDIT_CODE}`)).toBeVisible()
            await expect(list.getByTestId(`staff-policy-row-${STAFF_MANAGE_CODE}`)).toHaveCount(0)
          },
        )
      })
    })
  })
})
