import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { LEADER, LOGIN_EMAIL, LOGIN_STAFF, SCHEDULE_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { STAFF_FORM, issueManagerToken, newStaff, removePolicy } from '../../fixtures/staff'
import { openApiClient, openApiReference } from '../../screens/apiReference'
import { signInAtBroker } from '../../screens/login'
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
const STAFF_MANAGE_CODE = 'staff.manage'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** 撮影の前に登録する職員の名前。仮の名前にする。 */
const STAFF_NAME = '見本 職員'

type Grant = { user_policy_id: string; policy_id: string }

/** 予定の API で、チームと役職を指定して職員を登録し、ID と付いた権限を返す。シードの職員の権限を変えないため。 */
const registerIn = async (
  request: APIRequestContext,
  token: string,
  o: { label: string; teamId: string; positionId: string },
) => {
  const res = await request.post(
    `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/users`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: STAFF_NAME,
        email: newStaff(o.label).email,
        department_id: STAFF_FORM.departmentId,
        team_id: o.teamId,
        position_id: o.positionId,
      },
    },
  )
  if (res.status() !== 201) throw new Error(`職員を登録できない: ${res.status()} ${await res.text()}`)
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

/** 撮る職員の詳細を開き、ブローカーで青木としてログインして、その画面に戻る。 */
const signInAtDetail = async (page: Page, id: string) => {
  await page.goto(`/staff/${id}`)
  await signInAtBroker(page, LOGIN_EMAIL)
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

/** 権限のタブを開き、権限の一覧が出るまで待つ。 */
const openPoliciesTab = async (page: Page) => {
  await page.getByTestId('staff-detail-tab-policies').click()
  await expect(page.getByTestId('staff-policy-list')).toBeVisible()
}

/** API の参照のページを開き、青木のトークンを返す。 */
const openApiReferenceWithToken = async (page: Page) => {
  await routeApiReference(page)
  await openApiReference(page, 'schedule')
  return issueAccessToken(page.request, LOGIN_EMAIL)
}

/** API の参照のページを開き、トークンを取って、役職を変える相手のメンバーの職員を作る。シードの職員の権限を変えないため。 */
const prepareMember = async (page: Page) => {
  const token = await openApiReferenceWithToken(page)
  const staff = await registerIn(page.request, token, {
    label: 'position-api',
    teamId: TEAM_B,
    positionId: MEMBER_POSITION,
  })
  return { token, userId: staff.id }
}

test.describe('職員の管理', () => {
  test.describe('職員の役職', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}メンバーの役職をリーダーに変えた場合、役職と権限がリーダーのデフォルトになること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-position-change',
            title: 'メンバーの役職をリーダーに変えると、役職と権限がリーダーのデフォルトになる',
            actor: ACTOR,
            variant,
          },
          prepareMember,
          async ({ page, step, check }, { token, userId }) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', {
              tag: 'staff',
              method: 'put',
              path: '/v1/users/{user_id}/position',
            })
            await step(
              'API の参照のページで「職員の役職を変える」のリクエストを開いている。チーム B のメンバーの「見本 職員」を、撮影の前に作ってある',
            )

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step('「見本 職員」の役職をリーダーに変えるリクエストを送る')
            await fillApiVariable(page, 'user_id', userId)
            await fillApiBody(page, { position_id: LEADER_POSITION })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await expect(apiClient(page).dialog).toContainText('"name": "リーダー"')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.team.edit"')
            await check(
              '200 が返り、役職がリーダーになり、権限がリーダーのデフォルト（自分の予定の編集、チームの予定の閲覧と編集）になる',
            )
          },
        )
      })

      test(`${prefix}指定した職員の予定の閲覧を個別に足したメンバーの役職をリーダーに変えた場合、個別に足した権限が残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-keep-individual',
            title: '個別に足した権限が役職を変えても残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await issueManagerToken()
            const staff = await registerIn(page.request, token, {
              label: 'position-keep-individual',
              teamId: TEAM_A,
              positionId: MEMBER_POSITION,
            })
            await addTargetedPolicy(page.request, token, staff.id, {
              policy_id: USER_READ.id,
              target_user_ids: [LEADER.staff.id],
            })
            await signInAtDetail(page, staff.id)
            return staff.id
          },
          async ({ page, step, check }, id) => {
            await openDetail(page, id, STAFF_NAME)
            await step(
              `「指定した職員の予定の閲覧」（${LEADER.staff.name}）を個別に足したメンバーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
            )

            await step('「役職を変える」から「リーダー」を選んで保存する')
            const dialog = await submitPosition(page, LEADER_POSITION)
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('リーダー')

            await step('権限のタブを開く')
            await openPoliciesTab(page)
            const position = page.getByTestId('staff-policy-group-position')
            await expect(position).toContainText('役職「リーダー」で付く権限')
            await expect(position.getByTestId(/^staff-policy-row-/)).toHaveCount(3)
            const individual = page.getByTestId('staff-policy-group-individual')
            if (isBefore) {
              await expect(individual).toHaveCount(0)
              await check(
                '役職の名前が「リーダー」になり、「役職「リーダー」で付く権限」に 3 つの権限が出る。改修前は「個別に足した権限」のまとまりが出ない',
              )
            } else {
              await expect(individual.getByTestId(`staff-policy-row-${USER_READ.code}`)).toContainText(
                '指定した職員の予定の閲覧',
              )
              await expect(
                individual.getByTestId(`staff-policy-targets-${USER_READ.code}`),
              ).toHaveText(LEADER.staff.name)
              await check(
                `役職の名前が「リーダー」になり、権限のタブの「役職「リーダー」で付く権限」に 3 つの権限が、「個別に足した権限」に「指定した職員の予定の閲覧」と対象の「${LEADER.staff.name}」が出る`,
              )
            }
          },
        )
      })

      test(`${prefix}チーム B を対象にするチームの予定の編集を個別に足したチーム A のメンバーの役職をリーダーに変えた場合、チームの予定の編集の対象が B のまま残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-overlap-keeps-target',
            title: '新しい役職のデフォルトにもある個別の権限は対象が残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await issueManagerToken()
            const staff = await registerIn(page.request, token, {
              label: 'position-overlap-keeps-target',
              teamId: TEAM_A,
              positionId: MEMBER_POSITION,
            })
            await addTargetedPolicy(page.request, token, staff.id, {
              policy_id: TEAM_EDIT.id,
              target_team_ids: [TEAM_B],
            })
            await signInAtDetail(page, staff.id)
            return staff.id
          },
          async ({ page, step, check }, id) => {
            await openDetail(page, id, STAFF_NAME)
            await step(
              `チーム B を対象にする「チームの予定の編集」を個別に足した、チーム A のメンバーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
            )

            await step('「役職を変える」から「リーダー」を選んで保存する')
            const dialog = await submitPosition(page, LEADER_POSITION)
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('リーダー')

            await step('権限のタブを開く')
            await openPoliciesTab(page)
            const position = page.getByTestId('staff-policy-group-position')
            await expect(position).toContainText('役職「リーダー」で付く権限')
            await expect(position.getByTestId(`staff-policy-targets-${TEAM_READ.code}`)).toHaveText(
              'A',
            )
            await expect(position.getByTestId(`staff-policy-targets-${TEAM_EDIT.code}`)).toHaveText(
              isBefore ? 'A' : 'B',
            )
            await check(
              isBefore
                ? '改修前は、「役職「リーダー」で付く権限」の「チームの予定の編集」の対象が「A」になる。「チームの予定の閲覧」の対象には「A」が出る'
                : '権限のタブの「役職「リーダー」で付く権限」の「チームの予定の編集」の対象に「B」だけが出て、「A」は出ない。「チームの予定の閲覧」の対象には「A」が出る',
            )
          },
        )
      })

      test(`${prefix}チームの予定の閲覧の対象を A と B に直したチーム A のリーダーを API で同じリーダーに変えた場合、200 が返り、対象が A と B のまま残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-same-keeps-targets',
            title: '同じ役職に変えると職員ごとに直した対象が残る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await openApiReferenceWithToken(page)
            const staff = await registerIn(page.request, token, {
              label: 'position-same-keeps-targets',
              teamId: TEAM_A,
              positionId: LEADER_POSITION,
            })
            await retargetTeamReadToAB(page.request, token, staff)
            return { token, userId: staff.id }
          },
          async ({ page, step, check }, { token, userId }) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', {
              tag: 'staff',
              method: 'put',
              path: '/v1/users/{user_id}/position',
            })
            await step(
              `API の参照のページで「職員の役職を変える」のリクエストを開いている。チーム A のリーダーの「${STAFF_NAME}」を撮影の前に登録し、「チームの予定の閲覧」の対象を A と B に直してある`,
            )

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step(`「${STAFF_NAME}」を今と同じ「リーダー」に変えるリクエストを送る`)
            await fillApiVariable(page, 'user_id', userId)
            await fillApiBody(page, { position_id: LEADER_POSITION })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await scrollApiResponseTo(page, `"code": "${TEAM_READ.code}"`)
            if (isBefore) {
              await check(
                '200 が返る。改修前は、「チームの予定の閲覧」の target_team_ids が A だけに戻る',
              )
            } else {
              await expect(apiClient(page).response).toContainText(
                new RegExp(
                  `"code": "${TEAM_READ.code}"[^}]*"target_team_ids": \\[\\s*"(${TEAM_A}|${TEAM_B})",\\s*"(${TEAM_A}|${TEAM_B})"\\s*\\]`,
                ),
              )
              await expect(apiClient(page).responseLine(TEAM_B)).toBeVisible()
              await check(
                '200 が返り、レスポンスの「チームの予定の閲覧」の target_team_ids に A と B の 2 つの ID が出る',
              )
            }
          },
        )
      })
    }

    // 改修前と同じ結果になるか、改修前には無い対照の観点なので、改修後だけを撮る
    for (const variant of EVIDENCE_VARIANTS.filter(({ name }) => name !== 'before')) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}チームの予定の閲覧の対象を A と B に直したチーム A のリーダーの役職をメンバーに変えた場合、前の役職のデフォルトの権限が消えること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-default-replaced',
            title: '前の役職のデフォルトの権限は対象を直していても消える',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await issueManagerToken()
            const staff = await registerIn(page.request, token, {
              label: 'position-default-replaced',
              teamId: TEAM_A,
              positionId: LEADER_POSITION,
            })
            await retargetTeamReadToAB(page.request, token, staff)
            await signInAtDetail(page, staff.id)
            return staff.id
          },
          async ({ page, step, check }, id) => {
            await openDetail(page, id, STAFF_NAME)
            await step(
              `「チームの予定の閲覧」の対象を A と B に直した、チーム A のリーダーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
            )

            await step('「役職を変える」から「メンバー」を選んで保存する')
            const dialog = await submitPosition(page, MEMBER_POSITION)
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('メンバー')

            await step('権限のタブを開く')
            await openPoliciesTab(page)
            const list = page.getByTestId('staff-policy-list')
            await expect(list.getByTestId(`staff-policy-row-${SELF_EDIT_CODE}`)).toBeVisible()
            await expect(list.getByTestId(/^staff-policy-row-/)).toHaveCount(1)
            await expect(list.getByTestId(`staff-policy-row-${TEAM_READ.code}`)).toHaveCount(0)
            await expect(list.getByTestId(`staff-policy-row-${TEAM_EDIT.code}`)).toHaveCount(0)
            await check(
              '役職の名前が「メンバー」になり、権限のタブに「自分の予定の編集」だけが出て、「チームの予定の閲覧」と「チームの予定の編集」は出ない',
            )
          },
        )
      })

      test(`${prefix}チーム B のメンバーの役職をリーダーに変えた場合、チームの権限の対象が所属のチーム B になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-team-target',
            title: '新しい役職のチームの権限が所属のチームを対象にする',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await issueManagerToken()
            const staff = await registerIn(page.request, token, {
              label: 'position-team-target',
              teamId: TEAM_B,
              positionId: MEMBER_POSITION,
            })
            await signInAtDetail(page, staff.id)
            return staff.id
          },
          async ({ page, step, check }, id) => {
            await openDetail(page, id, STAFF_NAME)
            await step(
              `チーム B のメンバーの「${STAFF_NAME}」の職員の詳細を開いている（撮影の前に API で登録した）`,
            )

            await step('「役職を変える」から「リーダー」を選んで保存する')
            const dialog = await submitPosition(page, LEADER_POSITION)
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('リーダー')

            await step('権限のタブを開く')
            await openPoliciesTab(page)
            const position = page.getByTestId('staff-policy-group-position')
            await expect(position.getByTestId(`staff-policy-targets-${TEAM_READ.code}`)).toHaveText(
              'B',
            )
            await expect(position.getByTestId(`staff-policy-targets-${TEAM_EDIT.code}`)).toHaveText(
              'B',
            )
            await check('権限のタブの「チームの予定の閲覧」と「チームの予定の編集」の対象に「B」が出る')
          },
        )
      })

      // 青木が最後の有効な管理者である前提で撮るので、管理者を登録する position-manager-change-ok より前に置く
      test(`${prefix}事業所で唯一の有効な管理者の役職を職員の管理の権限の無いリーダーに変えた場合、拒まれて役職と権限が変わらないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-last-manager-conflict',
            title: '最後の有効な管理者を職員の管理の権限の無い役職に変えると拒まれる',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signInAtDetail(page, LOGIN_STAFF.id)
          },
          async ({ page, step, check }) => {
            await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
            await step(
              `職員の管理の権限を役職のデフォルトだけで持つ、事業所で唯一の有効な管理者の「${LOGIN_STAFF.name}」の職員の詳細を開いている（シードのまま）`,
            )

            await step('「役職を変える」から「リーダー」を選んで保存する')
            const dialog = await submitPosition(page, LEADER_POSITION)
            await expect(dialog.getByTestId('staff-position-error')).toHaveText(
              '職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。',
            )
            await expect(dialog).toBeVisible()
            await check(
              'ダイアログが閉じず、フッターに「職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。」が出る',
            )

            await step('ダイアログを閉じ、権限のタブを開く')
            await dialog.getByTestId('staff-position-cancel').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('管理者')
            await openPoliciesTab(page)
            await expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE_CODE}`)).toBeVisible()
            await check('役職の名前は「管理者」で、権限のタブに「職員の管理」が出る')
          },
        )
      })

      test(`${prefix}ほかに有効な管理者がいる管理者の役職を職員の管理の権限の無いリーダーに変えた場合、役職がリーダーになり職員の管理の権限が消えること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'position-manager-change-ok',
            title: 'ほかに有効な管理者がいれば職員の管理の権限の無い役職に変えられる',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await issueManagerToken()
            const staff = await registerIn(page.request, token, {
              label: 'position-manager-change-ok',
              teamId: TEAM_A,
              positionId: MANAGER_POSITION,
            })
            await signInAtDetail(page, staff.id)
            return staff.id
          },
          async ({ page, step, check }, id) => {
            await openDetail(page, id, STAFF_NAME)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('管理者')
            await step(
              `撮影の前に API で登録した管理者の「${STAFF_NAME}」の職員の詳細を開いている。${LOGIN_STAFF.name} もほかの有効な管理者である`,
            )

            await step('「役職を変える」から「リーダー」を選んで保存する')
            const dialog = await submitPosition(page, LEADER_POSITION)
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('staff-detail-position-name')).toHaveText('リーダー')

            await step('権限のタブを開く')
            await openPoliciesTab(page)
            const list = page.getByTestId('staff-policy-list')
            await expect(list.getByTestId(`staff-policy-row-${SELF_EDIT_CODE}`)).toBeVisible()
            await expect(list.getByTestId(`staff-policy-row-${STAFF_MANAGE_CODE}`)).toHaveCount(0)
            await check(
              'ダイアログが閉じ、役職の名前が「リーダー」になり、権限のタブに「職員の管理」が出ない',
            )
          },
        )
      })
    }
  })
})
