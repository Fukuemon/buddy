// #876 の受け入れの条件を確認する検証のシナリオのエビデンス。シナリオは docs/verification/876-position-change-grants/scenarios.md にある。
// @scenario-id: 876-keep-individual、876-kept-grant-authorizes、876-overlap-target、876-last-manager-individual
// s4-last-manager-individual は、シードの唯一の管理者の青木 陽菜を撮影の間だけリーダーに変える。finally で戻すが、
// 戻せなかったときにほかの撮影の前提が崩れるので、DB を作り直してから単独で流す。
// 字幕は、シナリオの「明日」を「明日（<撮った日の翌日の日付>）」にして出す。
import {
  expect,
  request as apiRequest,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { daysFromToday } from '../../fixtures/date'
import {
  BASE_URL,
  HAYASHI,
  LEADER,
  LOGIN_STAFF,
  LOGIN_STATE,
  SCHEDULE_URL,
  TEAM_MEMBER,
} from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  STAFF_FORM,
  STAFF_MANAGE_CODE,
  issueManagerToken,
  listStaff,
  newStaff,
  policyIdOf,
  removePolicy,
} from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { openDetail as openScheduleDetail } from '../../screens/scheduleDetail'
import { scheduleDetailDeleteButton } from '../../selectors/scheduleDetail'

const FACILITY_ID = STAFF_FORM.facilityId
const TEAM_A = STAFF_FORM.teamId
const TEAM_B = '01M3TC5MX04QJ19X6XR1ZCBZRJ'
/** シードの 1 つ目の事業所の役職。 */
const POSITION = {
  manager: '01M3TC5NW8G8HN54GZ984344PZ',
  leader: '01M3TC5PVG7W2H1H20W0T1ZVEJ',
  member: STAFF_FORM.positionId,
}
/** 指定した職員の予定の閲覧（schedule.user.read）。 */
const USER_READ = { id: '01M5E1S42TTS7QZK05YGS0GYR9', code: 'schedule.user.read' }
/** 指定したチームの職員の予定の閲覧（schedule.team.read）。リーダーの役職のデフォルトにある。 */
const TEAM_READ = { id: '01M5E1S42TTS7QZK05YGS0GYRB', code: 'schedule.team.read' }
/** 指定したチームの職員の予定の編集（schedule.team.edit）。リーダーの役職のデフォルトにある。 */
const TEAM_EDIT_CODE = 'schedule.team.edit'

/**
 * シナリオごとに撮影の前に登録する職員の仮の名前。同じ compose で続けて撮ると、前のシナリオの職員もチーム A の列に出るので、
 * 列の名前で見分けられるよう、シナリオごとに名前を分ける。
 */
const S1_NAME = '受入 一子'
const S2_NAME = '受入 二郎'
const S3_NAME = '受入 三奈'
const S4_NAME = '受入 四郎'
/** 予定を作る日。撮る日の翌日にする。 */
const DATE = daysFromToday(1)

type Registered = {
  id: string
  email: string
  policies: { user_policy_id: string; policy_id: string }[]
}

/** 予定の API で、チーム A のメンバーを name で登録する。シードの職員の権限を変えないため。 */
const registerMember = async (
  request: APIRequestContext,
  token: string,
  label: string,
  name: string,
) => {
  const email = newStaff(label).email
  const res = await request.post(`${SCHEDULE_URL}/v1/facilities/${FACILITY_ID}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username: name,
      email,
      department_id: STAFF_FORM.departmentId,
      team_id: TEAM_A,
      position_id: POSITION.member,
    },
  })
  if (res.status() !== 201)
    throw new Error(`職員を登録できない: ${res.status()} ${await res.text()}`)
  return { ...((await res.json()) as Omit<Registered, 'email'>), email } satisfies Registered
}

/** 職員に権限を足し（POST /v1/users/{user_id}/policies）、足した権限の user_policy_id を返す。 */
const grant = async (
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
  const body = (await res.json()) as Registered
  const added = body.policies.find((p) => p.policy_id === data.policy_id)
  if (added === undefined) throw new Error('足した権限が職員に無い')
  return added.user_policy_id
}

/** 職員の役職を変える（PUT /v1/users/{user_id}/position）。 */
const changePositionByApi = async (
  request: APIRequestContext,
  token: string,
  userId: string,
  positionId: string,
) => {
  const res = await request.put(`${SCHEDULE_URL}/v1/users/${userId}/position`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { position_id: positionId },
  })
  if (!res.ok()) throw new Error(`役職を変えられない: ${res.status()} ${await res.text()}`)
}

/** staffId の職員の、DATE の通常の予定を作り、ID を返す。 */
const scheduleOf = async (
  request: APIRequestContext,
  token: string,
  staffId: string,
  title: string,
  start: string,
) => {
  const [h, m] = start.split(':').map(Number)
  const end = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const res = await createNormalSchedule(request, token, FACILITY_ID, {
    staffId,
    title,
    date: DATE,
    start,
    end,
  })
  if (res.status() !== 201) throw new Error(`予定を作れない: ${res.status()} ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/** 権限 user_policy_id を外す（DELETE /v1/users/{user_id}/policies/{user_policy_id}）。 */
const revoke = async (
  request: APIRequestContext,
  token: string,
  userId: string,
  userPolicyId: string,
) => {
  const res = await removePolicy(request, token, userId, userPolicyId)
  if (!res.ok()) throw new Error(`権限を外せない: ${res.status()} ${await res.text()}`)
}

/** email の職員の access token を取る。Hydra のログインを前の職員と共有しないよう、空のコンテキストで取る。 */
const issueTokenOf = async (email: string) => {
  const context = await apiRequest.newContext({
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
  })
  try {
    return await issueAccessToken(context, email)
  } finally {
    await context.dispose()
  }
}

/** 事業所で、職員の管理の権限を持つ有効な職員の ID を返す。s4 の前提（撮る職員が唯一の有効な管理者）を確認するのに使う。 */
const activeManagers = async (request: APIRequestContext, token: string) => {
  const res = await listStaff(request, token, FACILITY_ID)
  if (!res.ok()) throw new Error(`職員を一覧できない: ${res.status()} ${await res.text()}`)
  const active = ((await res.json()) as { id: string; status: string }[]).filter(
    (s) => s.status === 'active',
  )
  const managers: string[] = []
  for (const s of active) {
    const detail = await request.get(`${SCHEDULE_URL}/v1/users/${s.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!detail.ok())
      throw new Error(`職員を取得できない: ${detail.status()} ${await detail.text()}`)
    const { policies } = (await detail.json()) as { policies: { code: string }[] }
    if (policies.some((p) => p.code === STAFF_MANAGE_CODE)) managers.push(s.id)
  }
  return managers
}

/** 録画の外で email の職員としてログインし、録画するコンテキストに cookie を移す。 */
const signInOutsideRecording = (browser: Browser, context: BrowserContext, email: string) =>
  prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, email)
  })

/** 職員の詳細を開き、名前が出るまで待つ。 */
const openStaffDetail = async (page: Page, id: string, name: string) => {
  await page.goto(`/staff/${id}`)
  await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
}

/** DATE の日の表示を開き、自分の列が出るまで待つ。 */
const openDay = async (page: Page, selfId: string) => {
  await page.goto(`/schedule?view=day&date=${DATE}`)
  await expect(page.getByTestId(`day-grid-staff-${selfId}`)).toBeVisible()
}

const column = (page: Page, staffId: string) => page.getByTestId(`day-grid-staff-${staffId}`)

test.describe('職員の管理', () => {
  test.describe('役職の変更の受け入れ', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
      test.use({ storageState: LOGIN_STATE })

      test('s1-keep-individual 個別に権限を足したメンバーの役職をリーダーに変えた場合、残ることを示す注意が出て、変えた後も個別に足した権限に対象ごと残ること', async ({
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = await registerMember(request, token, 's1-keep-individual', S1_NAME)

        const page = await context.newPage()
        await openStaffDetail(page, staff.id, S1_NAME)
        await intro(
          page,
          `個別に足した権限は、役職を変えても対象ごと残る\n前提 チーム A のメンバーの ${S1_NAME} の職員の詳細を、${LOGIN_STAFF.name} が開いている（撮影の前に API で登録した）`,
        )

        const policies = page.getByTestId('staff-policies-dialog')
        await step(
          page,
          `もし 権限のタブで「指定した職員の予定の閲覧」を対象「${LEADER.staff.name}」で足す`,
          async () => {
            await page.getByTestId('staff-detail-tab-policies').click()
            await page.getByTestId('staff-detail-policies-change').click()
            await policies.getByTestId(`staff-policies-option-${USER_READ.code}`).check()
            const add = policies
              .getByTestId('staff-policies-group-other')
              .getByTestId('staff-policies-target-add')
            await add.fill(LEADER.staff.name)
            await policies.getByTestId(`staff-policies-target-option-${LEADER.staff.id}`).click()
            await policies.getByTestId('staff-policies-submit').click()
            await expect(policies).toHaveCount(0)
          },
        )
        const individual = page.getByTestId('staff-policy-group-individual')
        await check(
          page,
          `ならば 「個別に足した権限」に「指定した職員の予定の閲覧」と対象「${LEADER.staff.name}」が出る`,
          () =>
            expect(individual.getByTestId(`staff-policy-targets-${USER_READ.code}`)).toHaveText(
              LEADER.staff.name,
            ),
        )

        const dialog = page.getByTestId('staff-position-dialog')
        await step(page, 'もし 「役職を変える」で「リーダー」を選ぶ', async () => {
          await page.getByTestId('staff-detail-tab-profile').click()
          await page.getByTestId('staff-detail-position-change').click()
          await dialog.getByTestId(`staff-position-option-${POSITION.leader}`).check()
        })
        await check(
          page,
          `ならば 注意に「役職を変えると、${S1_NAME} の役職で付く権限は、新しい役職で付く権限に置き換わります。個別に足した権限（指定した職員の予定の閲覧）は残ります。」が出る`,
          () =>
            expect(dialog.getByTestId('staff-position-note')).toHaveText(
              `役職を変えると、${S1_NAME} の役職で付く権限は、新しい役職で付く権限に置き換わります。個別に足した権限（指定した職員の予定の閲覧）は残ります。`,
            ),
        )

        await step(page, 'もし 「役職を変える」を押す', async () => {
          await dialog.getByTestId('staff-position-submit').click()
          await expect(dialog).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-position-name')).toHaveText('リーダー')
        })
        await step(page, '(撮影のため、権限のタブを開く)', async () => {
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-policy-list')).toBeVisible()
        })
        const position = page.getByTestId('staff-policy-group-position')
        await check(
          page,
          'ならば 役職が「リーダー」になり、「役職「リーダー」で付く権限」に 3 つの権限が出る',
          async () => {
            await expect(position).toContainText('役職「リーダー」で付く権限')
            await expect(position.getByTestId(/^staff-policy-row-/)).toHaveCount(3)
          },
        )
        await check(
          page,
          `かつ 「個別に足した権限」に「指定した職員の予定の閲覧」と対象「${LEADER.staff.name}」が残る`,
          async () => {
            await expect(individual.getByTestId(/^staff-policy-row-/)).toHaveCount(1)
            await expect(
              individual.getByTestId(`staff-policy-targets-${USER_READ.code}`),
            ).toHaveText(LEADER.staff.name)
          },
        )
      })
    })

    // 撮る職員は、spec の中で登録したシナリオごとの職員である。setup に置けないので、録画の外でログインして cookie を移す
    test.describe(`${S2_NAME}、${S3_NAME}、${S4_NAME}（撮影の前に登録したチーム A のメンバーをリーダーに変えた職員。${S4_NAME} は職員の管理の権限も持つ）`, () => {
      test('s2-kept-grant-authorizes 個別に足した権限を持つメンバーをリーダーに変えた後に日の表示を開いた場合、残った権限で予定が見え、外すと見えなくなること', async ({
        browser,
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = await registerMember(request, token, 's2-kept-grant-authorizes', S2_NAME)
        const userRead = await grant(request, token, staff.id, {
          policy_id: USER_READ.id,
          target_user_ids: [LEADER.staff.id],
        })
        await changePositionByApi(request, token, staff.id, POSITION.leader)
        const hayashi = await scheduleOf(request, token, HAYASHI.id, '受け入れ 林の予定', '10:00')
        const mori = await scheduleOf(request, token, LEADER.staff.id, '受け入れ 森の予定', '11:00')
        await scheduleOf(request, token, TEAM_MEMBER.id, '受け入れ 佐藤の予定', '12:00')
        await signInOutsideRecording(browser, context, staff.email)

        const page = await context.newPage()
        await openDay(page, staff.id)
        await expect(page.getByTestId('viewer-menu')).toContainText(S2_NAME)
        await intro(
          page,
          `残った権限が予定の判定に使われ、外すと使われない\n前提 「指定した職員の予定の閲覧」（${LEADER.staff.name}）を個別に足したチーム A のメンバーの ${S2_NAME} をリーダーに変え、明日（${DATE}）に ${HAYASHI.name}、${LEADER.staff.name}、${TEAM_MEMBER.name} の予定を作ってある（撮影の前に API で行った）。${S2_NAME} でログインし、明日（${DATE}）の日の表示を開いている`,
        )

        const event = (staffId: string, scheduleId: string) =>
          column(page, staffId).getByTestId(`schedule-event-${scheduleId}`)
        await check(
          page,
          `ならば ${HAYASHI.name}（リーダーのチームの予定の閲覧、チーム A）と ${LEADER.staff.name}（個別に足した権限）の列が出て、${TEAM_MEMBER.name} の列は出ない`,
          async () => {
            await expect(event(HAYASHI.id, hayashi)).toBeVisible()
            await expect(event(LEADER.staff.id, mori)).toBeVisible()
            await expect(column(page, TEAM_MEMBER.id)).toHaveCount(0)
          },
        )

        await step(
          page,
          `もし (撮影のため) ${LOGIN_STAFF.name} が API で ${S2_NAME} から「指定した職員の予定の閲覧」を外す`,
          // 録画が 4 分を超えることがあるので、トークンを取り直す
          async () => revoke(request, await issueManagerToken(), staff.id, userRead),
        )
        await step(page, 'かつ 日の表示を読み込み直す', async () => {
          await page.reload()
          await expect(column(page, staff.id)).toBeVisible()
        })
        await check(page, `ならば ${LEADER.staff.name} の列が出なくなる`, async () => {
          await expect(column(page, LEADER.staff.id)).toHaveCount(0)
          await expect(event(HAYASHI.id, hayashi)).toBeVisible()
        })
      })

      test('s3-overlap-target チームの予定の閲覧をチーム B で個別に足したチーム A のメンバーをリーダーに変えた場合、閲覧の対象が B のまま残り、編集はチーム A の予定だけに出ること', async ({
        browser,
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = await registerMember(request, token, 's3-overlap-target', S3_NAME)
        await grant(request, token, staff.id, {
          policy_id: TEAM_READ.id,
          target_team_ids: [TEAM_B],
        })
        await changePositionByApi(request, token, staff.id, POSITION.leader)
        const hayashi = await scheduleOf(request, token, HAYASHI.id, '受け入れ 林の予定', '13:00')
        const mori = await scheduleOf(request, token, LEADER.staff.id, '受け入れ 森の予定', '14:00')
        await signInOutsideRecording(browser, context, staff.email)

        const page = await context.newPage()
        await page.goto('/me')
        await expect(page.getByTestId('account-profile-name')).toHaveText(S3_NAME)
        await intro(
          page,
          `新しい役職のデフォルトにもある個別の権限は対象が残り、判定もその対象で行う\n前提 チーム A のメンバーの ${S3_NAME} に「指定したチームの職員の予定の閲覧」を対象「B」で個別に足してリーダーに変え、明日（${DATE}）に ${HAYASHI.name} と ${LEADER.staff.name} の予定を作ってある（撮影の前に API で行った）。${S3_NAME} でログインし、自分の情報を開いている`,
        )

        await check(
          page,
          'ならば 「チームの予定の閲覧」の対象は「B」だけで、「チームの予定の編集」の対象は「A」である',
          async () => {
            await expect(
              page.getByTestId(`account-profile-policy-targets-${TEAM_READ.code}`),
            ).toHaveText(/^\s*B\s*$/)
            await expect(
              page.getByTestId(`account-profile-policy-targets-${TEAM_EDIT_CODE}`),
            ).toHaveText(/^\s*A\s*$/)
          },
        )

        const modal = page.getByTestId('schedule-detail-modal')
        await step(
          page,
          `もし 明日（${DATE}）の日の表示で ${LEADER.staff.name} の予定の詳細を開く`,
          () => openScheduleDetail(page, mori, DATE),
        )
        await check(page, 'ならば 「閉じる」だけが出て、「編集」は出ない', async () => {
          await expect(modal.getByTestId('schedule-detail-close')).toBeVisible()
          await expect(modal.getByTestId('schedule-detail-edit')).toHaveCount(0)
          await expect(modal.getByTestId('schedule-detail-cancel-schedule')).toHaveCount(0)
          await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
        })

        await step(page, `もし ${HAYASHI.name} の予定の詳細を開く`, () =>
          openScheduleDetail(page, hayashi, DATE),
        )
        await check(page, 'ならば 「編集」が出る', () =>
          expect(modal.getByTestId('schedule-detail-edit')).toBeVisible(),
        )
      })

      test('s4-last-manager-individual 職員の管理を個別に足した唯一の有効な管理者が自分の役職をリーダーに変えた場合、変えられて職員の管理が個別に足した権限に残ること', async ({
        browser,
        context,
        request,
      }) => {
        const managerToken = await issueManagerToken()
        const staff = await registerMember(
          request,
          managerToken,
          's4-last-manager-individual',
          S4_NAME,
        )
        const manageId = await policyIdOf(request, managerToken, STAFF_MANAGE_CODE)
        const manage = await grant(request, managerToken, staff.id, { policy_id: manageId })
        let staffToken: string | undefined
        let aokiChanged = false
        let passed = false
        try {
          staffToken = await issueTokenOf(staff.email)
          await changePositionByApi(request, staffToken, LOGIN_STAFF.id, POSITION.leader)
          aokiChanged = true
          // 撮る職員が唯一の有効な管理者でなければ、変更の後の権限で判定する分岐を通らずに変えられてしまう
          expect(await activeManagers(request, staffToken)).toEqual([staff.id])
          await signInOutsideRecording(browser, context, staff.email)

          const page = await context.newPage()
          await openStaffDetail(page, staff.id, S4_NAME)
          await intro(
            page,
            `個別に足した職員の管理の権限だけを持つ最後の管理者は、その権限の無い役職に変えられる\n前提 チーム A のメンバーの ${S4_NAME} に「職員の管理」を個別に足し、${LOGIN_STAFF.name} をリーダーに変えてあり（撮影の前に API で行った）、${S4_NAME} が事業所で唯一の有効な管理者である。${S4_NAME} でログインし、自分の職員の詳細を開いている`,
          )

          const dialog = page.getByTestId('staff-position-dialog')
          await step(
            page,
            `もし ${S4_NAME} が自分の職員の詳細で「役職を変える」から「リーダー」を選んで保存する`,
            async () => {
              await page.getByTestId('staff-detail-position-change').click()
              await dialog.getByTestId(`staff-position-option-${POSITION.leader}`).check()
              await dialog.getByTestId('staff-position-submit').click()
              await expect(dialog).toHaveCount(0)
            },
          )
          await check(page, 'ならば 役職が「リーダー」になる', () =>
            expect(page.getByTestId('staff-detail-position-name')).toHaveText('リーダー'),
          )
          await step(page, '(撮影のため、権限のタブを開く)', async () => {
            await page.getByTestId('staff-detail-tab-policies').click()
            await expect(page.getByTestId('staff-policy-list')).toBeVisible()
          })
          await check(page, 'かつ 権限のタブの「個別に足した権限」に「職員の管理」が残る', () =>
            expect(
              page
                .getByTestId('staff-policy-group-individual')
                .getByTestId(`staff-policy-row-${STAFF_MANAGE_CODE}`),
            ).toBeVisible(),
          )
          passed = true
        } finally {
          // 青木 陽菜を管理者に戻してから、撮る職員の職員の管理を外す。position-last-manager-conflict が、青木 陽菜を唯一の管理者とする前提に戻すため。
          // 逆の順では、外す時点で撮る職員が唯一の管理者なので 409 になる。
          // 撮影が先に失敗したときは、その失敗を報告に残すため、戻しの失敗は投げずに出力だけする
          const restoreErrors: unknown[] = []
          if (aokiChanged && staffToken !== undefined) {
            await changePositionByApi(request, staffToken, LOGIN_STAFF.id, POSITION.manager).catch(
              (e: unknown) => restoreErrors.push(e),
            )
          }
          await revoke(request, await issueManagerToken(), staff.id, manage).catch((e: unknown) =>
            restoreErrors.push(e),
          )
          if (restoreErrors.length > 0) {
            if (passed) throw restoreErrors[0]
            console.error('s4 の前提を戻せなかった', restoreErrors)
          }
        }
      })
    })
  })
})
