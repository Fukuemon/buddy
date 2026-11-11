// DB を作り直してから単独で流す。s3-position-change と s5-position-create が作る役職は、役職を消す API が無く戻せない
// @scenario-id: 875-grant-add、875-grant-remove、875-position-change、875-team-change、875-position-create、875-staff-create、875-leave-retire、875-forbidden
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  HAYASHI,
  LEADER,
  LEADER_STATE,
  LOGIN_STAFF,
  LOGIN_STATE,
  SCHEDULE_URL,
} from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import {
  STAFF_FORM,
  addPolicy,
  issueManagerToken,
  newStaff,
  registerStaff,
  removePolicy,
} from '../../fixtures/staff'
import { openApiClient, openApiReference } from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'
import { staffProfileValue } from '../../selectors/staffProfile'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'

/** シードの 1 つ目の事業所の役職。管理者は職員の管理の権限をデフォルトに持ち、リーダーは持たない。 */
const MANAGER_POSITION = { id: '01M3TC5NW8G8HN54GZ984344PZ', name: '管理者' }
const LEADER_POSITION = { id: '01M3TC5PVG7W2H1H20W0T1ZVEJ', name: 'リーダー' }

/** 初期のマイグレーションが入れる権限。 */
const STAFF_MANAGE = { id: '01M5E5GP6Q8BQYNWN66QHJF60J', code: 'staff.manage' }
const USER_READ = { id: '01M5E1S42TTS7QZK05YGS0GYR9', code: 'schedule.user.read' }
const TEAM_READ = { id: '01M5E1S42TTS7QZK05YGS0GYRB', code: 'schedule.team.read' }
const SELF_EDIT = { id: '01M5E1S42TTS7QZK05YGS0GYR8', code: 'schedule.self.edit' }
const TEAM_EDIT = { id: '01M5E1S42TTS7QZK05YGS0GYRC', code: 'schedule.team.edit' }

/** シードの 1 つ目の事業所のチーム。 */
const TEAM_A = { id: STAFF_FORM.teamId, name: 'A' }
const TEAM_B = { id: '01M3TC5MX04QJ19X6XR1ZCBZRJ', name: 'B' }

/** シードの 2 つ目の事業所（上野 渚の事業所）のチームと役職。 */
const OFFICE_B_TEAM = '01M5J5EE027HQPBXW2QS38DE55'
const OFFICE_B_POSITION = '01M5J5EE03MRY548V96BCRH79E'

/** シードの林 さくらの「指定した職員の予定の閲覧」の user_policy_id。 */
const HAYASHI_USER_READ = '01M5E1V0KR0WQZ6M3B1C4D5E6K'

type Op = { tag: string; method: string; path: string }

const ADD_POLICY: Op = { tag: 'staff', method: 'post', path: '/v1/users/{user_id}/policies' }
const REMOVE_POLICY: Op = {
  tag: 'staff',
  method: 'delete',
  path: '/v1/users/{user_id}/policies/{user_policy_id}',
}
const CHANGE_POSITION: Op = { tag: 'staff', method: 'put', path: '/v1/users/{user_id}/position' }
const UPDATE_STAFF: Op = { tag: 'staff', method: 'put', path: '/v1/users/{user_id}' }
const CREATE_POSITION: Op = {
  tag: 'organization',
  method: 'post',
  path: '/v1/facilities/{facility_id}/positions',
}
const CREATE_STAFF: Op = {
  tag: 'staff',
  method: 'post',
  path: '/v1/facilities/{facility_id}/users',
}
const LEAVE: Op = { tag: 'staff', method: 'post', path: '/v1/users/{user_id}/leave' }
const RETIRE: Op = { tag: 'staff', method: 'post', path: '/v1/users/{user_id}/retire' }

const headers = (token: string) => ({ Authorization: `Bearer ${token}` })

/** 録画の外で、email の職員のトークンを取る。 */
const tokenOf = (browser: Browser, email: string) =>
  prepareOutsideRecording(browser, {}, (page) => issueAccessToken(page.request, email))

/** 青木のトークンで職員を登録し、ID と名前を返す。シードの職員の権限を変えないため。 */
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
  return { id: ((await res.json()) as { id: string }).id, name }
}

/** 職員 userId の、code の権限の user_policy_id を返す。無ければ undefined を返す。 */
const userPolicyIdOf = async (request: APIRequestContext, userId: string, code: string) => {
  const token = await issueManagerToken()
  const res = await request.get(`${SCHEDULE_URL}/v1/users/${userId}`, { headers: headers(token) })
  if (!res.ok()) throw new Error(`職員を読めない: ${res.status()}`)
  const { policies } = (await res.json()) as {
    policies: { user_policy_id: string; code: string }[]
  }
  return policies.find((p) => p.code === code)?.user_policy_id
}

/** 職員 userId に code の権限があれば外す。ほかの撮影の前提に戻すために、撮った後に呼ぶ。 */
const dropPolicy = async (request: APIRequestContext, userId: string, code: string) => {
  const id = await userPolicyIdOf(request, userId, code)
  if (id === undefined) return
  const res = await removePolicy(request, await issueManagerToken(), userId, id)
  if (!res.ok()) throw new Error(`権限を外せない: ${res.status()}`)
}

/** 職員 userId の役職を変える。ほかの撮影の前提に戻すために、撮った後に呼ぶ。 */
const putPosition = async (request: APIRequestContext, userId: string, positionId: string) => {
  const res = await request.put(`${SCHEDULE_URL}/v1/users/${userId}/position`, {
    headers: headers(await issueManagerToken()),
    data: { position_id: positionId },
  })
  if (!res.ok()) throw new Error(`役職を変えられない: ${res.status()}`)
}

/** 職員 id のプロフィールを読み、その値に戻す関数を返す。 */
const keepProfile = async (request: APIRequestContext, id: string) => {
  const token = await issueManagerToken()
  const res = await request.get(`${SCHEDULE_URL}/v1/users/${id}`, { headers: headers(token) })
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
      headers: headers(await issueManagerToken()),
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

/** 職員の詳細を開き、名前が出るまで待つ。 */
const openDetail = async (page: Page, id: string, name: string) => {
  await page.goto(`/staff/${id}`)
  await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
}

/** 権限のタブの「権限を変える」のダイアログを開く。 */
const openPolicies = async (page: Page) => {
  await page.getByTestId('staff-detail-tab-policies').click()
  await page.getByTestId('staff-detail-policies-change').click()
  return page.getByTestId('staff-policies-dialog')
}

/** 「役職を変える」のダイアログで positionId を選んで保存する。 */
const choosePosition = async (page: Page, positionId: string) => {
  const dialog = page.getByTestId('staff-position-dialog')
  await page.getByTestId('staff-detail-position-change').click()
  await dialog.getByTestId(`staff-position-option-${positionId}`).check()
  await dialog.getByTestId('staff-position-submit').click()
  return dialog
}

/**
 * API の参照のページで op のリクエストを開き、token、パスの引数、本文を入れて送り、status の行が出るまで待つ。
 * 開いているクライアントがあれば閉じてから開く。
 */
const sendRequest = async (
  page: Page,
  o: {
    op: Op
    token: string
    vars?: Record<string, string>
    body?: unknown
    status: string
  },
) => {
  // クライアントは前のレスポンスを持ったまま開き直すので、本文の欄と前のレスポンスの欄が並ぶ。読み直して空にする
  if (await apiClient(page).dialog.isVisible()) await page.reload()
  await openApiClient(page, 'schedule', o.op)
  await fillApiToken(page, o.token)
  for (const [name, value] of Object.entries(o.vars ?? {})) await fillApiVariable(page, name, value)
  if (o.body !== undefined) await fillApiBody(page, o.body)
  await apiClient(page).send.click()
  await expect(apiClient(page).dialog).toContainText(o.status)
}

/**
 * 撮った後の片付けを全部流し、失敗があればまとめて投げる。1 つが失敗しても、残りの片付けを流すため。
 *
 * @param steps ほかの撮影の前提に戻す処理
 */
const cleanUp = async (...steps: (() => Promise<unknown>)[]) => {
  const failed = (await Promise.allSettled(steps.map((s) => s()))).filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  )
  if (failed.length > 0)
    throw new AggregateError(
      failed.map((r) => r.reason),
      '片付けに失敗した',
    )
}

/** 録画する page に API の参照のページの route を張る。 */
const recordingPage = async (context: BrowserContext) => {
  const page = await context.newPage()
  await routeApiReference(page)
  return page
}

test.describe('職員の管理の権限の委譲', () => {
  test.describe(`${LOGIN_STAFF.name}（管理者、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('s1-grant-add 職員の管理の権限を持つ職員が自分とほかの職員に権限を足した場合、両方に権限が付き、同じ権限と別の事業所の対象は拒まれること', async ({
      context,
      request,
    }) => {
      const target = await registerFor(request, 's1-grant-add', '見本 委譲先')
      const token = await issueManagerToken()
      try {
        const page = await recordingPage(context)
        await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
        await intro(
          page,
          `自分とほかの職員に任意の権限を足せ、同じ権限と別の事業所の対象は拒まれる\n前提 ${LOGIN_STAFF.name} でログインし、録画の前に登録したメンバーの「${target.name}」がいる`,
        )

        await step(
          page,
          `もし 自分の権限の変更で「指定した職員の予定の閲覧」を対象「${target.name}」で足して保存する`,
          async () => {
            const dialog = await openPolicies(page)
            await dialog.getByTestId(`staff-policies-option-${USER_READ.code}`).check()
            await dialog.getByTestId('staff-policies-target-add').click()
            await dialog.getByTestId(`staff-policies-target-option-${target.id}`).click()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog).toHaveCount(0)
          },
        )
        await check(page, 'ならば 自分の権限のタブに「指定した職員の予定の閲覧」が出る', () =>
          expect(page.getByTestId(`staff-policy-targets-${USER_READ.code}`)).toHaveText(
            target.name,
          ),
        )

        await step(
          page,
          `もし 「${target.name}」の権限の変更で「職員の管理」を足して保存する`,
          async () => {
            await openDetail(page, target.id, target.name)
            const dialog = await openPolicies(page)
            await dialog.getByTestId(`staff-policies-option-${STAFF_MANAGE.code}`).check()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog).toHaveCount(0)
          },
        )
        await check(page, `ならば 「${target.name}」の権限のタブに「職員の管理」が出る`, () =>
          expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toBeVisible(),
        )

        await step(
          page,
          `もし API の参照のページから、「${target.name}」に同じ「職員の管理」を足すリクエストを ${LOGIN_STAFF.name} のトークン（伏せ字）で送る`,
          () =>
            sendRequest(page, {
              op: ADD_POLICY,
              token,
              vars: { user_id: target.id },
              body: { policy_id: STAFF_MANAGE.id },
              status: '409 Conflict',
            }),
        )
        await check(page, 'ならば 409 が返る', () =>
          expect(apiClient(page).dialog).toContainText('409 Conflict'),
        )

        await step(
          page,
          `もし 別の事業所のチームを対象にして「指定したチームの職員の予定の閲覧」を「${target.name}」に足すリクエストを送る`,
          () =>
            sendRequest(page, {
              op: ADD_POLICY,
              token,
              vars: { user_id: target.id },
              body: { policy_id: TEAM_READ.id, target_team_ids: [OFFICE_B_TEAM] },
              status: '400 Bad Request',
            }),
        )
        await check(page, 'ならば 400 が返る', () =>
          expect(apiClient(page).dialog).toContainText('400 Bad Request'),
        )
      } finally {
        // ほかの撮影は、職員の管理の権限を持つ有効な職員が青木だけであることを前提にする
        await cleanUp(
          () => dropPolicy(request, target.id, STAFF_MANAGE.code),
          () => dropPolicy(request, LOGIN_STAFF.id, USER_READ.code),
        )
      }
    })

    test('s2-grant-remove 職員の管理の権限を持つ職員が自分とほかの管理者から権限を外した場合、外せて、最後の管理者の職員の管理は外せないこと', async ({
      context,
      request,
    }) => {
      const second = await registerFor(request, 's2-grant-remove', '見本 管理者二')
      try {
        const token = await issueManagerToken()
        const manage = await addPolicy(request, token, second.id, STAFF_MANAGE.id)
        if (!manage.ok()) throw new Error(`職員の管理を足せなかった: ${manage.status()}`)
        const read = await request.post(`${SCHEDULE_URL}/v1/users/${LOGIN_STAFF.id}/policies`, {
          headers: headers(token),
          data: { policy_id: USER_READ.id, target_user_ids: [second.id] },
        })
        if (!read.ok()) throw new Error(`指定した職員の予定の閲覧を足せなかった: ${read.status()}`)

        const page = await recordingPage(context)
        await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
        await page.getByTestId('staff-detail-tab-policies').click()
        await expect(page.getByTestId(`staff-policy-row-${USER_READ.code}`)).toBeVisible()
        await intro(
          page,
          `自分とほかの管理者から権限を外せ、最後の管理者の職員の管理は外せない\n前提 ${LOGIN_STAFF.name} と、録画の前に職員の管理の権限を足した「${second.name}」の 2 人が、職員の管理の権限を持つ有効な職員である`,
        )

        await step(
          page,
          'もし 自分の権限の変更で、録画の前に足した「指定した職員の予定の閲覧」を外して保存する',
          async () => {
            await page.getByTestId('staff-detail-policies-change').click()
            const dialog = page.getByTestId('staff-policies-dialog')
            await dialog.getByTestId(`staff-policies-option-${USER_READ.code}`).uncheck()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog).toHaveCount(0)
          },
        )
        await check(
          page,
          'ならば 自分の権限のタブから「指定した職員の予定の閲覧」が消える',
          async () => {
            await expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toBeVisible()
            await expect(page.getByTestId(`staff-policy-row-${USER_READ.code}`)).toHaveCount(0)
          },
        )

        await step(
          page,
          `もし 「${second.name}」の権限の変更で「職員の管理」を外して保存する`,
          async () => {
            await openDetail(page, second.id, second.name)
            const dialog = await openPolicies(page)
            await dialog.getByTestId(`staff-policies-option-${STAFF_MANAGE.code}`).uncheck()
            await dialog.getByTestId('staff-policies-submit').click()
            await expect(dialog).toHaveCount(0)
          },
        )
        await check(
          page,
          `ならば 「${second.name}」の権限のタブから「職員の管理」が消える`,
          async () => {
            await expect(page.getByTestId(`staff-policy-row-${SELF_EDIT.code}`)).toBeVisible()
            await expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toHaveCount(0)
          },
        )

        const dialog = page.getByTestId('staff-policies-dialog')
        await step(page, 'もし 自分の権限の変更で「職員の管理」を外して保存する', async () => {
          await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
          await openPolicies(page)
          await dialog.getByTestId(`staff-policies-option-${STAFF_MANAGE.code}`).uncheck()
          await dialog.getByTestId('staff-policies-submit').click()
        })
        await check(
          page,
          'ならば 「職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。」が出る',
          () =>
            expect(dialog.getByTestId('staff-policies-error')).toContainText(
              '職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
            ),
        )
        await step(page, '(撮影のため、「キャンセル」でダイアログを閉じる)', async () => {
          await dialog.getByTestId('staff-policies-cancel').click()
          await expect(dialog).toHaveCount(0)
        })
        await check(page, 'かつ 自分の権限のタブに「職員の管理」が残る', () =>
          expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toBeVisible(),
        )
      } finally {
        await cleanUp(
          () => dropPolicy(request, second.id, STAFF_MANAGE.code),
          () => dropPolicy(request, LOGIN_STAFF.id, USER_READ.code),
        )
      }
    })

    test('s3-position-change 職員の管理の権限を持つ職員がほかの管理者と自分の役職を変えた場合、変えられて、最後の管理者を職員の管理の無い役職には変えられないこと', async ({
      context,
      request,
    }) => {
      const positionName = `E2E 管理者 ${Date.now()}`
      let third: { id: string; name: string } | undefined
      try {
        third = await registerFor(
          request,
          's3-position-change',
          '見本 管理者三',
          MANAGER_POSITION.id,
        )
        const created = await request.post(
          `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/positions`,
          {
            headers: headers(await issueManagerToken()),
            data: { name: positionName, policy_ids: [STAFF_MANAGE.id, SELF_EDIT.id] },
          },
        )
        if (created.status() !== 201) throw new Error(`役職を作れなかった: ${created.status()}`)
        const positionId = ((await created.json()) as { id: string }).id

        const page = await recordingPage(context)
        await openDetail(page, third.id, third.name)
        await expect(page.getByTestId('staff-detail-position-name')).toHaveText(
          MANAGER_POSITION.name,
        )
        await intro(
          page,
          `ほかの管理者と自分の役職を変えられ、最後の管理者を職員の管理の無い役職には変えられない\n前提 ${LOGIN_STAFF.name} と「${third.name}」（役職 管理者）の 2 人が管理者で、録画の前に職員の管理の権限を持つ役職「${positionName}」を作ってある`,
        )

        await step(page, `もし 「${third.name}」の役職をリーダーに変えて保存する`, async () => {
          const dialog = await choosePosition(page, LEADER_POSITION.id)
          await expect(dialog).toHaveCount(0)
        })
        await check(page, `ならば 「${third.name}」の役職がリーダーになる`, () =>
          expect(page.getByTestId('staff-detail-position-name')).toHaveText(LEADER_POSITION.name),
        )
        await step(page, '(撮影のため、権限のタブを開く)', () =>
          page.getByTestId('staff-detail-tab-policies').click(),
        )
        await check(page, 'かつ 「職員の管理」が消える', async () => {
          await expect(page.getByTestId(`staff-policy-row-${TEAM_READ.code}`)).toBeVisible()
          await expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toHaveCount(0)
        })

        await step(page, `もし 自分の役職を「${positionName}」に変えて保存する`, async () => {
          await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
          const dialog = await choosePosition(page, positionId)
          await expect(dialog).toHaveCount(0)
        })
        await check(page, `ならば 自分の役職が「${positionName}」になる`, () =>
          expect(page.getByTestId('staff-detail-position-name')).toHaveText(positionName),
        )
        await step(page, '(撮影のため、権限のタブを開く)', () =>
          page.getByTestId('staff-detail-tab-policies').click(),
        )
        await check(page, 'かつ 「職員の管理」が残る', () =>
          expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toBeVisible(),
        )

        const dialog = page.getByTestId('staff-position-dialog')
        await step(page, 'もし 自分の役職をリーダーに変えて保存する', async () => {
          // 「役職を変える」はプロフィールのタブにある
          await page.getByTestId('staff-detail-tab-profile').click()
          await choosePosition(page, LEADER_POSITION.id)
        })
        await check(
          page,
          'ならば 「職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。」が出る',
          () =>
            expect(dialog.getByTestId('staff-position-error')).toHaveText(
              '職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。',
            ),
        )
        await step(page, '(撮影のため、「キャンセル」でダイアログを閉じる)', async () => {
          await dialog.getByTestId('staff-position-cancel').click()
          await expect(dialog).toHaveCount(0)
        })
        await check(page, `かつ 自分の役職は「${positionName}」のままである`, () =>
          expect(page.getByTestId('staff-detail-position-name')).toHaveText(positionName),
        )
        await step(page, '(撮影のため、権限のタブを開く)', () =>
          page.getByTestId('staff-detail-tab-policies').click(),
        )
        await check(page, 'かつ 「職員の管理」が残る', () =>
          expect(page.getByTestId(`staff-policy-row-${STAFF_MANAGE.code}`)).toBeVisible(),
        )
      } finally {
        // 見本 管理者三が管理者のままだと、職員の管理の権限を持つ有効な職員が青木だけに戻らない
        const thirdId = third?.id
        await cleanUp(
          () => putPosition(request, LOGIN_STAFF.id, MANAGER_POSITION.id),
          async () => {
            if (thirdId !== undefined) await putPosition(request, thirdId, LEADER_POSITION.id)
          },
        )
      }
    })

    test('s4-team-change 職員の管理の権限を持つ職員がほかの職員と自分のチームを変えた場合、チームが変わり、ほかの職員の権限の対象が新しいチームに移ること', async ({
      context,
      request,
    }) => {
      const restoreLeader = await keepProfile(request, LEADER.staff.id)
      const restoreSelf = await keepProfile(request, LOGIN_STAFF.id)
      try {
        const page = await recordingPage(context)
        await openDetail(page, LEADER.staff.id, LEADER.staff.name)
        await page.getByTestId('staff-detail-tab-policies').click()
        await expect(page.getByTestId(`staff-policy-targets-${TEAM_READ.code}`)).toHaveText(
          TEAM_B.name,
        )
        await intro(
          page,
          `ほかの職員と自分のチームを変えられ、権限の対象が新しいチームに移る\n前提 チームを対象にする権限を持つ ${LEADER.staff.name}（チーム B）がいる`,
        )

        const edit = page.getByTestId('staff-detail-edit-dialog')
        await step(
          page,
          `もし ${LEADER.staff.name} のプロフィールでチームを A に変えて保存する`,
          async () => {
            await page.getByTestId('staff-detail-tab-profile').click()
            await page.getByTestId('staff-detail-edit').click()
            await edit.getByTestId('staff-detail-team-input').selectOption(TEAM_A.id)
            await edit.getByTestId('staff-detail-save').click()
            await expect(edit).toHaveCount(0)
          },
        )
        await check(page, `ならば ${LEADER.staff.name} のチームが A になる`, () =>
          expect(staffProfileValue(page, 'チーム')).toHaveText(TEAM_A.name),
        )
        await step(page, '(撮影のため、権限のタブを開く)', () =>
          page.getByTestId('staff-detail-tab-policies').click(),
        )
        await check(page, 'かつ チームの予定の閲覧と編集の対象が A になる', async () => {
          await expect(page.getByTestId(`staff-policy-targets-${TEAM_READ.code}`)).toHaveText(
            TEAM_A.name,
          )
          await expect(page.getByTestId(`staff-policy-targets-${TEAM_EDIT.code}`)).toHaveText(
            TEAM_A.name,
          )
        })

        await step(page, 'もし 自分のプロフィールでチームを B に変えて保存する', async () => {
          await openDetail(page, LOGIN_STAFF.id, LOGIN_STAFF.name)
          await page.getByTestId('staff-detail-edit').click()
          await edit.getByTestId('staff-detail-team-input').selectOption(TEAM_B.id)
          await edit.getByTestId('staff-detail-save').click()
          await expect(edit).toHaveCount(0)
        })
        await check(page, 'ならば 自分のチームが B になる', () =>
          expect(staffProfileValue(page, 'チーム')).toHaveText(TEAM_B.name),
        )
      } finally {
        await cleanUp(restoreLeader, restoreSelf)
      }
    })

    test('s5-position-create 職員の管理の権限を持つ職員が職員の管理をデフォルトに付けた役職を作った場合、作れて、同じ名前の役職は拒まれること', async ({
      context,
    }) => {
      const token = await issueManagerToken()
      const name = `E2E 委譲 ${Date.now()}`
      const body = { name, policy_ids: [STAFF_MANAGE.id, SELF_EDIT.id] }

      const page = await recordingPage(context)
      await openApiReference(page, 'schedule')
      await intro(
        page,
        `職員の管理をデフォルトに付けた役職を作れ、同じ名前の役職は拒まれる\n前提 ${LOGIN_STAFF.name} のトークン（伏せ字）で、API の参照のページの「役職を作る」を開いている`,
      )

      await step(
        page,
        `もし 名前「${name}」と権限「職員の管理」「自分の予定の編集」の役職を作るリクエストを送る`,
        () =>
          sendRequest(page, {
            op: CREATE_POSITION,
            token,
            vars: { facility_id: STAFF_FORM.facilityId },
            body,
            status: '201 Created',
          }),
      )
      await check(page, 'ならば 201 が返り、名前と 2 つの権限が出る', async () => {
        await expect(apiClient(page).dialog).toContainText('201 Created')
        await expect(apiClient(page).dialog).toContainText(`"name": "${name}"`)
        await expect(apiClient(page).dialog).toContainText(`"code": "${STAFF_MANAGE.code}"`)
        await expect(apiClient(page).dialog).toContainText(`"code": "${SELF_EDIT.code}"`)
      })

      await step(page, 'もし 同じ名前で役職を作るリクエストを送る', () =>
        sendRequest(page, {
          op: CREATE_POSITION,
          token,
          vars: { facility_id: STAFF_FORM.facilityId },
          body,
          status: '409 Conflict',
        }),
      )
      await check(page, 'ならば 409 が返る', () =>
        expect(apiClient(page).dialog).toContainText('409 Conflict'),
      )
    })

    test('s6-staff-create 職員の管理の権限を持つ職員が役職を付けて職員を登録した場合、役職の権限が付き、別の事業所の役職は拒まれること', async ({
      context,
    }) => {
      const token = await issueManagerToken()
      const page = await recordingPage(context)
      const staff = { ...newStaff('s6-staff-create'), name: '見本 登録' }
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-table')).toBeVisible()
      await intro(
        page,
        `役職を付けて職員を登録でき、別の事業所の役職は拒まれる\n前提 ${LOGIN_STAFF.name} でログインし、職員の一覧を開いている`,
      )

      await step(page, 'もし 職員の登録で、役職をリーダーにして登録する', async () => {
        await page.getByTestId('staff-list-new').click()
        const dialog = page.getByTestId('staff-new-dialog')
        await dialog.getByTestId('staff-new-name').fill(staff.name)
        await dialog.getByTestId('staff-new-email').fill(staff.email)
        await dialog.getByTestId('staff-new-position').selectOption(LEADER_POSITION.id)
        await dialog.getByTestId('staff-new-submit').click()
        await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
        await page.getByTestId('staff-detail-tab-policies').click()
      })
      await check(
        page,
        'ならば 登録した職員の詳細が開き、リーダーの 3 つの権限が出る',
        async () => {
          const group = page.getByTestId('staff-policy-group-position')
          for (const code of [SELF_EDIT.code, TEAM_READ.code, TEAM_EDIT.code])
            await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
        },
      )

      await step(
        page,
        `もし API の参照のページから、別の事業所の役職で職員を登録するリクエストを ${LOGIN_STAFF.name} のトークン（伏せ字）で送る`,
        () =>
          sendRequest(page, {
            op: CREATE_STAFF,
            token,
            vars: { facility_id: STAFF_FORM.facilityId },
            body: {
              username: '見本 別の事業所の役職',
              email: newStaff('s6-other-facility').email,
              department_id: STAFF_FORM.departmentId,
              team_id: STAFF_FORM.teamId,
              position_id: OFFICE_B_POSITION,
            },
            status: '400 Bad Request',
          }),
      )
      await check(page, 'ならば 400 が返る', () =>
        expect(apiClient(page).dialog).toContainText('400 Bad Request'),
      )
    })

    test('s7-leave-retire 職員の管理の権限を持つ職員が自分とほかの職員を休職と退職にしようとした場合、自分は拒まれ、ほかの職員は休職と退職にできること', async ({
      context,
      request,
    }) => {
      const retiree = await registerFor(request, 's7-retire', '見本 退職')
      const leaver = await registerFor(request, 's7-leave', '見本 休職')
      const token = await issueManagerToken()

      const page = await recordingPage(context)
      await openApiReference(page, 'schedule')
      await intro(
        page,
        `自分は休職と退職にできず、ほかの職員は休職と退職にできる\n前提 ${LOGIN_STAFF.name} のトークン（伏せ字）で、API の参照のページを開いている。録画の前に「${retiree.name}」と「${leaver.name}」を登録してある`,
      )

      await step(page, 'もし 自分を休職にするリクエストを送る', () =>
        sendRequest(page, {
          op: LEAVE,
          token,
          vars: { user_id: LOGIN_STAFF.id },
          body: {},
          status: '409 Conflict',
        }),
      )
      await check(page, 'ならば 409 が返り、自分を休職にできないことの文が出る', async () => {
        await expect(apiClient(page).dialog).toContainText('409 Conflict')
        await expect(apiClient(page).dialog).toContainText('自分を休職か退職にすることはできません')
      })

      await step(page, 'もし 自分を退職にするリクエストを送る', () =>
        sendRequest(page, {
          op: RETIRE,
          token,
          vars: { user_id: LOGIN_STAFF.id },
          status: '409 Conflict',
        }),
      )
      await check(page, 'ならば 409 が返る', () =>
        expect(apiClient(page).dialog).toContainText('409 Conflict'),
      )

      await step(page, `もし 「${retiree.name}」を退職にするリクエストを送る`, () =>
        sendRequest(page, {
          op: RETIRE,
          token,
          vars: { user_id: retiree.id },
          status: '200 OK',
        }),
      )
      await check(page, 'ならば 200 が返る', () =>
        expect(apiClient(page).dialog).toContainText('200 OK'),
      )

      await step(page, `もし 「${leaver.name}」の職員の詳細の「…」から休職にする`, async () => {
        await openDetail(page, leaver.id, leaver.name)
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-leave').click()
        await expect(page.getByTestId('staff-leave-assignments')).toBeVisible()
        await page.getByTestId('staff-leave-submit').click()
      })
      await check(page, `ならば 「${leaver.name}」が休職になる`, () =>
        expect(page.getByTestId('staff-detail-status')).toContainText('休職'),
      )
    })
  })

  test.describe(`${LEADER.staff.name}（リーダー、職員の管理の権限なし、API の参照のページ）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('s8-forbidden 職員の管理の権限を持たない職員が職員の管理の 8 つの操作のリクエストを送った場合、どれも 403 が返ること', async ({
      browser,
      context,
      request,
    }) => {
      const token = await tokenOf(browser, LEADER.email)
      const target = await registerFor(request, 's8-forbidden', '見本 権限なしの対象')

      const page = await recordingPage(context)
      await openApiReference(page, 'schedule')
      await intro(
        page,
        `職員の管理の権限を持たない職員の操作は、予定の API がどれも 403 で拒む\n前提 ${LEADER.staff.name}（リーダー、職員の管理の権限なし）のトークン（伏せ字）を API の参照のページに入れる。対象は録画の前に登録した「${target.name}」と ${HAYASHI.name}`,
      )

      const requests: { label: string; op: Op; vars: Record<string, string>; body?: unknown }[] = [
        {
          label: `「${target.name}」に「職員の管理」を足す`,
          op: ADD_POLICY,
          vars: { user_id: target.id },
          body: { policy_id: STAFF_MANAGE.id },
        },
        {
          label: `${HAYASHI.name} の「指定した職員の予定の閲覧」を外す`,
          op: REMOVE_POLICY,
          vars: { user_id: HAYASHI.id, user_policy_id: HAYASHI_USER_READ },
        },
        {
          label: `「${target.name}」の役職を管理者に変える`,
          op: CHANGE_POSITION,
          vars: { user_id: target.id },
          body: { position_id: MANAGER_POSITION.id },
        },
        {
          label: `「${target.name}」のチームを B に変える`,
          op: UPDATE_STAFF,
          vars: { user_id: target.id },
          body: {
            username: target.name,
            department_id: STAFF_FORM.departmentId,
            team_id: TEAM_B.id,
            visits: true,
          },
        },
        {
          label: '職員の管理をデフォルトに付けた役職を作る',
          op: CREATE_POSITION,
          vars: { facility_id: STAFF_FORM.facilityId },
          body: { name: `E2E 権限なし ${Date.now()}`, policy_ids: [STAFF_MANAGE.id] },
        },
        {
          label: '役職を管理者にして職員を登録する',
          op: CREATE_STAFF,
          vars: { facility_id: STAFF_FORM.facilityId },
          body: {
            username: '見本 権限なしの登録',
            email: newStaff('s8-create').email,
            department_id: STAFF_FORM.departmentId,
            team_id: STAFF_FORM.teamId,
            position_id: MANAGER_POSITION.id,
          },
        },
        {
          label: `「${target.name}」を休職にする`,
          op: LEAVE,
          vars: { user_id: target.id },
          body: {},
        },
        {
          label: `「${target.name}」を退職にする`,
          op: RETIRE,
          vars: { user_id: target.id },
        },
      ]
      for (const [i, r] of requests.entries()) {
        await step(page, `もし ${i + 1}. ${r.label}リクエストを送る`, () =>
          sendRequest(page, {
            op: r.op,
            token,
            vars: r.vars,
            body: r.body,
            status: '403 Forbidden',
          }),
        )
        await check(page, `ならば ${i + 1}. 403 が返る`, () =>
          expect(apiClient(page).dialog).toContainText('403 Forbidden'),
        )
      }
    })
  })
})
