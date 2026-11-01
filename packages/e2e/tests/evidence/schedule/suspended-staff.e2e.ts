import { expect, test, type APIRequestContext } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF, OFFICE_B, SUSPENDED_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createNormalSchedule, getSchedule } from '../../fixtures/schedule'
import { leaveStaff, listStaff, reinstateStaff, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

type ListedStaff = { id: string; username: string; status: string; leave_started_at: string | null }

/** 予定の API の職員の一覧を、email の職員のトークンで取る。録画に映らない API の結果を字幕に出すのに使う。 */
const fetchStaff = async (request: APIRequestContext, email: string, facilityId: string) => {
  const res = await listStaff(request, await issueAccessToken(request, email), facilityId)
  expect(res.status()).toBe(200)
  return (await res.json()) as ListedStaff[]
}

/** 字幕に出す、API の職員の一覧の 1 行。休職の職員には休職にした時刻を添える。 */
const describeStaff = (list: ListedStaff[]) =>
  list
    .map((staff) =>
      staff.leave_started_at === null
        ? staff.username
        : `${staff.username}（休職にした時刻 ${staff.leave_started_at}）`,
    )
    .join('、')

const OFFICE_B_ACTOR = `${OFFICE_B.staff.name}（2 つ目の事業所のマネージャー）`

test.describe('予定のカレンダー', () => {
  test.describe('止めた職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}止めた職員がいる事業所で予定のカレンダーを開いた場合、止めた職員の列が出ないこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.status).toBe('on_leave')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-suspended-staff-column',
            title:
              '止めた職員がいる事業所で予定のカレンダーを日の表示で開くと、止めた職員の列が出ない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(
              [
                '止めた職員がいる 2 つ目の事業所で、予定のカレンダーを開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step('日の表示を開く')
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${SUSPENDED_STAFF.id}`)).toHaveCount(0)
            await check(
              `${OFFICE_B.staff.name}の列だけが出て、止めた職員の${SUSPENDED_STAFF.name}の列は出ない`,
            )
          },
        )
      })

      test(`${prefix}止めた職員がいる事業所で職員の絞り込みの候補を開いた場合、止めた職員が候補に出ないこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.status).toBe('on_leave')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-suspended-staff-filter',
            title: '止めた職員がいる事業所で職員の絞り込みを開くと、止めた職員が候補に出ない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(
              [
                '止めた職員がいる 2 つ目の事業所で、予定のカレンダーを開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            const sidebar = page.getByTestId('staff-filter-sidebar')
            await step('左の職員の絞り込みの候補を見る')
            await expect(
              sidebar.getByTestId(`staff-filter-staff-${OFFICE_B.staff.id}`),
            ).toBeVisible()
            await expect(
              sidebar.getByTestId(`staff-filter-staff-${SUSPENDED_STAFF.id}`),
            ).toHaveCount(0)
            await check(
              `職員の絞り込みの候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
            )
          },
        )
      })

      test(`${prefix}止めていない職員だけの事業所で予定のカレンダーを開いた場合、全ての職員の列が API の一覧と同じ順に出ること`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, LOGIN_EMAIL, STAFF_FORM.facilityId)
        expect(staff.every(({ status }) => status === 'active')).toBe(true)
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-active-staff-columns',
            title:
              '止めていない職員だけの事業所で予定のカレンダーを日の表示で開くと、全ての職員の列が今と同じ順に出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(
              [
                '止めた職員がいない 1 つ目の事業所で、予定のカレンダーを開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を、API が返した順に出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step('日の表示を開く')
            await page.goto('/schedule?view=day')
            const columns = page.getByTestId(/^day-grid-staff-/)
            await expect(columns).toHaveCount(staff.length)
            for (const [index, { id }] of staff.entries()) {
              await expect(columns.nth(index)).toHaveAttribute(
                'data-testid',
                `day-grid-staff-${id}`,
              )
            }
            await check(`${staff.length} 人の職員の列が、API の一覧と同じ順に全て出る`)
          },
        )
      })
    }
  })
})

test.describe('予定の作成', () => {
  test.describe('止めた職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}止めた職員がいる事業所で予定の作成の主訪問者の欄を開いた場合、止めた職員が候補に出ないこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.status).toBe('on_leave')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-suspended-staff',
            title:
              '止めた職員がいる事業所で予定の作成の主訪問者の欄を開くと、止めた職員が候補に出ない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
            await step(
              [
                '止めた職員がいる 2 つ目の事業所で、予定のカレンダーを日の表示で開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step('「予定を作成」を押し、項目の一覧の「主訪問者」を押す')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-field-staff').click()
            await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${SUSPENDED_STAFF.id}`)).toHaveCount(
              0,
            )
            await check(
              `主訪問者の候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
            )
          },
        )
      })

      test(`${prefix}URL の staffId が休職の職員を指す予定の作成の画面を開いた場合、主訪問者が未選択で開くこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.status).toBe('on_leave')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-on-leave-staff-url',
            title:
              'URL の staffId が休職の職員を指す予定の作成の画面を開くと、主訪問者が未選択で開く',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
            await step(
              [
                '休職の職員がいる 2 つ目の事業所で、予定のカレンダーを日の表示で開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step(
              `休職にする前に${SUSPENDED_STAFF.name}の列から開いた、staffId が${SUSPENDED_STAFF.name}の予定の作成の URL を開く`,
            )
            await page.goto(
              `/schedule/new?start=${OFFICE_B.schedule.date}&time=13:00&staffId=${SUSPENDED_STAFF.id}`,
            )
            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()

            await step('項目の一覧の「主訪問者」を押す')
            await page.getByTestId('schedule-field-staff').click()
            await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
            await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
            await expect(page.getByTestId('schedule-field-staff')).not.toContainText(
              SUSPENDED_STAFF.name,
            )
            await check(
              `主訪問者が「選んでください」で開き、休職の${SUSPENDED_STAFF.name}の名前は出ず、候補にも出ない`,
            )
          },
        )
      })
    }
  })
})

test.describe('予定の編集', () => {
  test.describe('止めた職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}止めた職員がいる事業所で予定の編集の予定者の欄を開いた場合、止めた職員が候補に出ないこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.status).toBe('on_leave')
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-edit-suspended-staff',
            title:
              '止めた職員がいる事業所で予定の編集の予定者の欄を開くと、止めた職員が候補に出ない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto(`/schedule?view=day&date=${OFFICE_B.schedule.date}`)
            const event = page
              .getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: OFFICE_B.schedule.title })
            await expect(event).toBeVisible()
            await step(
              [
                `止めた職員がいる 2 つ目の事業所で、${OFFICE_B.schedule.date} の日の表示を開いている`,
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step(`「${OFFICE_B.schedule.title}」を開き、「編集」を押す`)
            await event.click()
            await page.getByTestId('schedule-detail-edit').click()

            await step('項目の一覧の「予定者」を押す')
            await page.getByTestId('schedule-field-staff').click()
            await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${SUSPENDED_STAFF.id}`)).toHaveCount(
              0,
            )
            await check(
              `予定者の候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
            )
          },
        )
      })

      test(`${prefix}止めた職員に割り振った予定の編集を開いた場合、予定者の欄にその職員の名前が出て、保存しても予定者が変わらないこと`, async ({
        browser,
        request,
      }) => {
        // 撮るたびに予定が増えるので、タイトルで今回の予定を見分ける
        const stamp = Date.now()
        const title = `引き継ぎの面談 ${stamp}`
        const changed = `引き継ぎの面談（場所を変更）${stamp}`
        const token = await issueAccessToken(request, OFFICE_B.email)
        // 休職の職員には予定を作れないので、復職にして予定を作ってから休職に戻す
        expect((await reinstateStaff(request, token, SUSPENDED_STAFF.id)).status()).toBe(200)
        const created = await createNormalSchedule(request, token, OFFICE_B.facilityId, {
          staffId: SUSPENDED_STAFF.id,
          title,
          date: OFFICE_B.schedule.date,
        })
        expect(created.status()).toBe(201)
        expect((await leaveStaff(request, token, SUSPENDED_STAFF.id)).status()).toBe(200)
        const scheduleId = ((await created.json()) as { id: string }).id
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-edit-suspended-assignee',
            title:
              '止めた職員に割り振った予定の編集を開くと、予定者の欄にその職員の名前が出て、保存しても予定者が変わらない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto(`/schedule/${scheduleId}`)
            await expect(page.getByTestId('schedule-detail-modal')).toContainText(title)
            await step(
              [
                `止めた職員の${SUSPENDED_STAFF.name}に割り振った予定「${title}」の詳細を開いている`,
                '（撮影のため、予定は録画の前に予定の API で作った。予定のカレンダーは止めた職員の予定を出さないので、URL で開いた）',
              ].join('\n'),
            )

            await step('「編集」を押す')
            await page.getByTestId('schedule-detail-edit').click()
            await expect(page.getByTestId('schedule-field-staff')).toContainText(
              SUSPENDED_STAFF.name,
            )
            await check(`項目の一覧の「予定者」に、${SUSPENDED_STAFF.name}の名前が出る`)

            await step('項目の一覧の「予定者」を押す')
            await page.getByTestId('schedule-field-staff').click()
            await expect(page.getByTestId(`staff-select-option-${OFFICE_B.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${SUSPENDED_STAFF.id}`)).toHaveCount(
              0,
            )
            await check(
              `予定者の候補には${SUSPENDED_STAFF.name}が出ず、どの職員も選ばれていない。「予定者」の名前はそのまま`,
            )

            await step(`予定者は選ばずに、タイトルを「${changed}」に変えて保存する`)
            await page.getByTestId('schedule-field-title').click()
            await page.getByTestId('schedule-form-title').fill(changed)
            await page.getByTestId('schedule-edit-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toContainText(changed)
            await expect(page.getByTestId('schedule-detail-modal')).toContainText(
              SUSPENDED_STAFF.name,
            )
            const saved = await getSchedule(request, token, scheduleId)
            expect(saved.status()).toBe(200)
            const body = (await saved.json()) as { title: string; staff_id: string }
            expect(body).toMatchObject({ title: changed, staff_id: SUSPENDED_STAFF.id })
            await check(
              [
                `予定の詳細に変えた後のタイトルが出て、予定者は${SUSPENDED_STAFF.name}のまま`,
                `（撮影のため、録画に映らない予定の API の予定を出す）タイトル: ${body.title}、予定の職員: ${body.staff_id === SUSPENDED_STAFF.id ? SUSPENDED_STAFF.name : body.staff_id}`,
              ].join('\n'),
            )
          },
        )
      })
    }
  })
})
