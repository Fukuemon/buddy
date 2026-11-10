import { expect, test, type APIRequestContext } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OFFICE_B,
  OFFICE_B_STATE,
  SUSPENDED_STAFF,
} from '../../fixtures/env'
import { createNormalSchedule, getSchedule } from '../../fixtures/schedule'
import { leaveStaff, listStaff, reinstateStaff, STAFF_FORM } from '../../fixtures/staff'

type ListedStaff = { id: string; username: string; status: string; leave_started_at: string | null }

/** 予定の API の職員の一覧を、email の職員のトークンで取る。録画に映らない API の結果を字幕に出すのに使う。 */
const listOfficeStaff = async (request: APIRequestContext, email: string, facilityId: string) => {
  const res = await listStaff(request, await issueAccessToken(request, email), facilityId)
  expect(res.status()).toBe(200)
  return (await res.json()) as ListedStaff[]
}

/** 録画の前に、2 つ目の事業所の職員の一覧を取り、止めた職員が休職であることを確認する。 */
const listOfficeBStaff = async (request: APIRequestContext) => {
  const staff = await listOfficeStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
  expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.status).toBe('on_leave')
  return staff
}

/** 字幕に出す、API の職員の一覧の 1 行。休職の職員には休職にした時刻を添える。 */
const describeStaff = (staffList: ListedStaff[]) =>
  staffList
    .map((staff) =>
      staff.leave_started_at === null
        ? staff.username
        : `${staff.username}（休職にした時刻 ${staff.leave_started_at}）`,
    )
    .join('、')

const OFFICE_B_ACTOR = `${OFFICE_B.staff.name}、2 つ目の事業所のマネージャー`

test.describe('予定のカレンダー', () => {
  test.describe(`止めた職員（${OFFICE_B_ACTOR}）`, () => {
    test.use({ storageState: OFFICE_B_STATE })

    test('schedule-suspended-staff-column 止めた職員がいる事業所で予定のカレンダーを開いた場合、止めた職員の列が出ないこと', async ({
      context,
      request,
    }) => {
      const staff = await listOfficeBStaff(request)
      const page = await context.newPage()
      await page.goto('/schedule')
      await expect(page.getByTestId('schedule-create-open')).toBeVisible()
      await intro(
        page,
        [
          '止めた職員がいる事業所で予定のカレンダーを日の表示で開くと、止めた職員の列が出ない',
          '前提 止めた職員がいる 2 つ目の事業所で、予定のカレンダーを開いている',
          `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
        ].join('\n'),
      )

      await step(page, '日の表示を開く', async () => {
        await page.goto('/schedule?view=day')
      })
      await check(
        page,
        `${OFFICE_B.staff.name}の列だけが出て、止めた職員の${SUSPENDED_STAFF.name}の列は出ない`,
        async () => {
          await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
          await expect(page.getByTestId(`day-grid-staff-${SUSPENDED_STAFF.id}`)).toHaveCount(0)
        },
      )
    })

    test('schedule-suspended-staff-filter 止めた職員がいる事業所で職員の絞り込みの候補を開いた場合、止めた職員が候補に出ないこと', async ({
      context,
      request,
    }) => {
      const staff = await listOfficeBStaff(request)
      const page = await context.newPage()
      await page.goto('/schedule')
      const sidebar = page.getByTestId('staff-filter-sidebar')
      await expect(sidebar).toBeVisible()
      await intro(
        page,
        [
          '止めた職員がいる事業所で職員の絞り込みを開くと、止めた職員が候補に出ない',
          '前提 止めた職員がいる 2 つ目の事業所で、予定のカレンダーを開いている',
          `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
        ].join('\n'),
      )

      await check(
        page,
        `左の職員の絞り込みの候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
        async () => {
          await expect(sidebar.getByTestId(`staff-filter-staff-${OFFICE_B.staff.id}`)).toBeVisible()
          await expect(sidebar.getByTestId(`staff-filter-staff-${SUSPENDED_STAFF.id}`)).toHaveCount(
            0,
          )
        },
      )
    })
  })

  test.describe(`止めた職員（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-active-staff-columns 止めていない職員だけの事業所で予定のカレンダーを開いた場合、全ての職員の列が API の一覧と同じ順に出ること', async ({
      context,
      request,
    }) => {
      const staff = await listOfficeStaff(request, LOGIN_EMAIL, STAFF_FORM.facilityId)
      expect(staff.every(({ status }) => status === 'active')).toBe(true)
      const page = await context.newPage()
      await page.goto('/schedule')
      await expect(page.getByTestId('schedule-create-open')).toBeVisible()
      await intro(
        page,
        [
          '止めていない職員だけの事業所で予定のカレンダーを日の表示で開くと、全ての職員の列が今と同じ順に出る',
          '前提 止めた職員がいない 1 つ目の事業所で、予定のカレンダーを開いている',
          `（撮影のため、録画に映らない予定の API の職員の一覧を、API が返した順に出す）${describeStaff(staff)}`,
        ].join('\n'),
      )

      await step(page, '日の表示を開く', async () => {
        await page.goto('/schedule?view=day')
      })
      const columns = page.getByTestId(/^day-grid-staff-/)
      await check(
        page,
        `${staff.length} 人の職員の列が、API の一覧と同じ順に全て出る`,
        async () => {
          await expect(columns).toHaveCount(staff.length)
          for (const [index, { id }] of staff.entries()) {
            await expect(columns.nth(index)).toHaveAttribute('data-testid', `day-grid-staff-${id}`)
          }
        },
      )
    })
  })
})

test.describe('予定の作成', () => {
  test.describe(`止めた職員（${OFFICE_B_ACTOR}）`, () => {
    test.use({ storageState: OFFICE_B_STATE })

    test('schedule-create-suspended-staff 止めた職員がいる事業所で予定の作成の主訪問者の欄を開いた場合、止めた職員が候補に出ないこと', async ({
      context,
      request,
    }) => {
      const staff = await listOfficeBStaff(request)
      const page = await context.newPage()
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
      await intro(
        page,
        [
          '止めた職員がいる事業所で予定の作成の主訪問者の欄を開くと、止めた職員が候補に出ない',
          '前提 止めた職員がいる 2 つ目の事業所で、予定のカレンダーを日の表示で開いている',
          `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
        ].join('\n'),
      )

      await step(page, '「予定を作成」を押し、項目の一覧の「主訪問者」を押す', async () => {
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-field-staff').click()
      })
      await check(
        page,
        `主訪問者の候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
        async () => {
          await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
          await expect(page.getByTestId(`staff-select-option-${SUSPENDED_STAFF.id}`)).toHaveCount(0)
        },
      )
    })

    test('schedule-create-on-leave-staff-url URL の staffId が休職の職員を指す予定の作成の画面を開いた場合、主訪問者が未選択で開くこと', async ({
      context,
      request,
    }) => {
      const staff = await listOfficeBStaff(request)
      const page = await context.newPage()
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
      await intro(
        page,
        [
          'URL の staffId が休職の職員を指す予定の作成の画面を開くと、主訪問者が未選択で開く',
          '前提 休職の職員がいる 2 つ目の事業所で、予定のカレンダーを日の表示で開いている',
          `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
        ].join('\n'),
      )

      await step(
        page,
        `休職にする前に${SUSPENDED_STAFF.name}の列から開いた、staffId が${SUSPENDED_STAFF.name}の予定の作成の URL を開く`,
        async () => {
          await page.goto(
            `/schedule/new?start=${OFFICE_B.schedule.date}&time=13:00&staffId=${SUSPENDED_STAFF.id}`,
          )
          await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
        },
      )

      await step(page, '項目の一覧の「主訪問者」を押す', () =>
        page.getByTestId('schedule-field-staff').click(),
      )
      await check(
        page,
        `主訪問者が「選んでください」で開き、休職の${SUSPENDED_STAFF.name}の名前は出ず、候補にも出ない`,
        async () => {
          await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
          await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
          await expect(page.getByTestId('schedule-field-staff')).not.toContainText(
            SUSPENDED_STAFF.name,
          )
        },
      )
    })
  })
})

test.describe('予定の編集', () => {
  test.describe(`止めた職員（${OFFICE_B_ACTOR}）`, () => {
    test.use({ storageState: OFFICE_B_STATE })

    test('schedule-edit-suspended-staff 止めた職員がいる事業所で予定の編集の予定者の欄を開いた場合、止めた職員が候補に出ないこと', async ({
      context,
      request,
    }) => {
      const staff = await listOfficeBStaff(request)
      const page = await context.newPage()
      await page.goto(`/schedule?view=day&date=${OFFICE_B.schedule.date}`)
      const event = page
        .getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: OFFICE_B.schedule.title })
      await expect(event).toBeVisible()
      await intro(
        page,
        [
          '止めた職員がいる事業所で予定の編集の予定者の欄を開くと、止めた職員が候補に出ない',
          `前提 止めた職員がいる 2 つ目の事業所で、${OFFICE_B.schedule.date} の日の表示を開いている`,
          `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
        ].join('\n'),
      )

      await step(page, `「${OFFICE_B.schedule.title}」を開き、「編集」を押す`, async () => {
        await event.click()
        await page.getByTestId('schedule-detail-edit').click()
      })

      await step(page, '項目の一覧の「予定者」を押す', () =>
        page.getByTestId('schedule-field-staff').click(),
      )
      await check(
        page,
        `予定者の候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
        async () => {
          await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
          await expect(page.getByTestId(`staff-select-option-${SUSPENDED_STAFF.id}`)).toHaveCount(0)
        },
      )
    })

    test('schedule-edit-suspended-assignee 止めた職員に割り振った予定の編集を開いた場合、予定者の欄にその職員の名前が出て、保存しても予定者が変わらないこと', async ({
      context,
      request,
    }) => {
      // 撮るたびに予定が増えるので、タイトルで今回の予定を見分ける
      const stamp = Date.now()
      const title = `引き継ぎの面談 ${stamp}`
      const changed = `引き継ぎの面談（場所を変更）${stamp}`
      const token = await issueAccessToken(request, OFFICE_B.email)
      // 休職の職員には予定を作れないので、復職にして予定を作ってから休職に戻す
      expect((await reinstateStaff(request, token, SUSPENDED_STAFF.id)).status()).toBe(200)
      let created: Awaited<ReturnType<typeof createNormalSchedule>>
      try {
        created = await createNormalSchedule(request, token, OFFICE_B.facilityId, {
          staffId: SUSPENDED_STAFF.id,
          title,
          date: OFFICE_B.schedule.date,
        })
      } finally {
        expect((await leaveStaff(request, token, SUSPENDED_STAFF.id)).status()).toBe(200)
      }
      expect(created.status()).toBe(201)
      const scheduleId = ((await created.json()) as { id: string }).id

      const page = await context.newPage()
      await page.goto(`/schedule/${scheduleId}`)
      await expect(page.getByTestId('schedule-detail-modal')).toContainText(title)
      await intro(
        page,
        [
          '止めた職員に割り振った予定の編集を開くと、予定者の欄にその職員の名前が出て、保存しても予定者が変わらない',
          `前提 止めた職員の${SUSPENDED_STAFF.name}に割り振った予定「${title}」の詳細を開いている`,
          '（撮影のため、予定は録画の前に予定の API で作った。予定のカレンダーは止めた職員の予定を出さないので、URL で開いた）',
        ].join('\n'),
      )

      await step(page, '「編集」を押す', () => page.getByTestId('schedule-detail-edit').click())
      await check(page, `項目の一覧の「予定者」に、${SUSPENDED_STAFF.name}の名前が出る`, () =>
        expect(page.getByTestId('schedule-field-staff')).toContainText(SUSPENDED_STAFF.name),
      )

      await step(page, '項目の一覧の「予定者」を押す', () =>
        page.getByTestId('schedule-field-staff').click(),
      )
      await check(
        page,
        `予定者の候補には${SUSPENDED_STAFF.name}が出ず、どの職員も選ばれていない。「予定者」の名前はそのまま`,
        async () => {
          await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
          await expect(page.getByTestId(`staff-select-option-${SUSPENDED_STAFF.id}`)).toHaveCount(0)
        },
      )

      await step(page, `予定者は選ばずに、タイトルを「${changed}」に変えて保存する`, async () => {
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(changed)
        await page.getByTestId('schedule-edit-submit').click()
        await expect(page.getByTestId('schedule-detail-modal')).toContainText(changed)
      })
      // 判定の字幕に、録画に映らない予定の API の予定を出すので、字幕の前に取る
      const saved = await getSchedule(request, token, scheduleId)
      const body = (await saved.json()) as { title: string; staff_id: string }
      await check(
        page,
        [
          `予定の詳細に変えた後のタイトルが出て、予定者は${SUSPENDED_STAFF.name}のまま`,
          `（撮影のため、録画に映らない予定の API の予定を出す）タイトル: ${body.title}、予定の職員: ${body.staff_id === SUSPENDED_STAFF.id ? SUSPENDED_STAFF.name : body.staff_id}`,
        ].join('\n'),
        async () => {
          await expect(page.getByTestId('schedule-detail-modal')).toContainText(
            SUSPENDED_STAFF.name,
          )
          expect(saved.status()).toBe(200)
          expect(body).toMatchObject({ title: changed, staff_id: SUSPENDED_STAFF.id })
        },
      )
    })
  })
})
