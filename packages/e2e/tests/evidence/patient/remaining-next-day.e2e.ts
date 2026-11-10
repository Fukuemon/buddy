import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, SCHEDULE_URL } from '../../fixtures/env'
import { registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'

/** 残る予定を作る日。今日より後にする。2030 年 1 月 8 日は火曜日である。 */
const OVERNIGHT_DATE = '2030-01-08'
const RECURRING_DATE = '2030-01-09'
const SAME_DAY_DATE = '2030-01-10'

/**
 * 予定の API のマスタから、名前（サービスコードは code）が name の 1 件の ID を返す。
 * 古いシードのサービスコードは全角の数字で入っているので、NFKC にそろえて比べる。
 */
const masterId = async (request: APIRequestContext, token: string, path: string, name: string) => {
  const res = await request.get(`${SCHEDULE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const found = ((await res.json()) as { id: string; name?: string; code?: string }[]).find(
    (m) => (m.name ?? m.code)?.normalize('NFKC') === name.normalize('NFKC'),
  )
  if (found === undefined) throw new Error(`${path} に ${name} が無い`)
  return found.id
}

/**
 * マネージャーのトークンで利用者を 1 人登録する。利用者の ID と、その利用者の訪問の予定を作って ID を返す関数を返す。
 */
const registerVisitPatient = async (page: Page, name: string) => {
  const token = await issueManagerToken()
  const registered = await registerPatient(page.request, token, STAFF_FORM.facilityId, {
    name,
    assignedStaffId: LOGIN_STAFF.id,
  })
  expect(registered.status()).toBe(201)
  const id = ((await registered.json()) as { id: string }).id
  const visitType = await masterId(page.request, token, '/v1/schedule_types', '訪問')
  const serviceCode = await masterId(page.request, token, '/v1/visit_infos/service_codes', '訪看I3')
  const create = async (
    path: string,
    slot: { date: string; start_time: string; end_time: string; ends_next_day: boolean },
    extra: object = {},
  ) => {
    const res = await page.request.post(
      `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}${path}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          schedule_type_id: visitType,
          staff_id: LOGIN_STAFF.id,
          ...slot,
          visit_info: {
            patient_id: id,
            assigned_staff_id: LOGIN_STAFF.id,
            service_code_id: serviceCode,
          },
          ...extra,
        },
      },
    )
    expect(res.status()).toBe(201)
    return ((await res.json()) as { id: string }).id
  }
  return { id, create }
}

/** 22:00 に始まり、翌日の 01:00 に終わる予定の時刻。 */
const OVERNIGHT = { start_time: '22:00', end_time: '01:00', ends_next_day: true }

/** 録画の外で利用者を 1 人登録し、翌日に終わる訪問の単発の予定と毎週の予定を作る。利用者の ID と名前と、予定の ID を返す。 */
const prepareOvernightPatient = (browser: Browser, name: string) =>
  prepareOutsideRecording(browser, {}, async (page) => {
    const { id, create } = await registerVisitPatient(page, name)
    return {
      id,
      name,
      overnight: await create('/schedules', { date: OVERNIGHT_DATE, ...OVERNIGHT }),
      recurring: await create(
        '/schedules/recurring',
        { date: RECURRING_DATE, ...OVERNIGHT },
        { recurring_rule: { frequency: 'weekly' } },
      ),
    }
  })

/** 録画の外で利用者を 1 人登録し、同じ日に終わる訪問の単発の予定だけを作る。利用者の ID と名前と、予定の ID を返す。 */
const prepareSameDayPatient = (browser: Browser, name: string) =>
  prepareOutsideRecording(browser, {}, async (page) => {
    const { id, create } = await registerVisitPatient(page, name)
    return {
      id,
      name,
      sameDay: await create('/schedules', {
        date: SAME_DAY_DATE,
        start_time: '10:00',
        end_time: '11:00',
        ends_next_day: false,
      }),
    }
  })

/** 利用者の詳細を開き、「…」のメニューから利用の終了のダイアログを開く。 */
const openEndDialog = async (page: Page, patientId: string) => {
  await page.goto(`/patients/${patientId}`)
  await page.getByTestId('patient-detail-menu').click()
  await page.getByTestId('patient-detail-end').click()
  await expect(page.getByTestId('patient-end-schedules')).toBeVisible()
}

test.describe('利用者の詳細', () => {
  test.describe(`残る予定の時刻の範囲（${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test(
      'patient-remaining-next-day 翌日に終わる単発の予定と繰り返しの予定が残る利用者の利用の終了のダイアログを開いた場合、終了の時刻に「翌」が付くこと',
      { tag: '@compare' },
      async ({ browser, context }) => {
        const patient = await prepareOvernightPatient(browser, '見本 夜子')

        const page = await context.newPage()
        await page.goto('/patients')
        await expect(page.getByTestId('patient-list-table')).toBeVisible()
        await intro(
          page,
          `翌日に終わる予定が残る利用者の利用の終了のダイアログで、終了の時刻に「翌」が付く\n前提 撮影の前に ${patient.name} を登録し、22:00 から翌日の 01:00 の訪問の単発の予定と毎週の予定を作った`,
        )

        await step(page, '利用者の詳細を開き、「…」から「利用を終了する」を押す', () =>
          openEndDialog(page, patient.id),
        )
        const scheduleText = '2030年1月8日（火） 22:00〜翌 01:00'
        const recurringText = '2030年1月9日（水）から終了日なし、22:00〜翌 01:00'
        // 改修前は「翌」が付かない。改修前でも通るよう、「翌」の有無を問わずに時刻の範囲を確認する
        await check(
          page,
          `単発は「${scheduleText}」、繰り返しは「${recurringText}」と出る。時刻の範囲は折り返さない`,
          async () => {
            const recurring = page.getByTestId(`patient-end-recurring-${patient.recurring}`)
            await expect(
              page.getByTestId(`patient-end-schedule-${patient.overnight}`),
            ).toContainText(/2030年1月8日（火） 22:00〜(翌 )?01:00/)
            await expect(recurring).toContainText(
              /2030年1月9日（水）から終了日なし、22:00〜(翌 )?01:00/,
            )
            await recurring.scrollIntoViewIfNeeded()
          },
        )
      },
    )

    test(
      'patient-remaining-same-day 同じ日に終わる予定が残る利用者の利用の終了のダイアログを開いた場合、終了の時刻に「翌」が付かないこと',
      { tag: '@compare' },
      async ({ browser, context }) => {
        const patient = await prepareSameDayPatient(browser, '見本 昼子')

        const page = await context.newPage()
        await page.goto('/patients')
        await expect(page.getByTestId('patient-list-table')).toBeVisible()
        await intro(
          page,
          `同じ日に終わる予定が残る利用者の利用の終了のダイアログで、終了の時刻に「翌」が付かない\n前提 撮影の前に ${patient.name} を登録し、10:00 から 11:00 の訪問の予定を作った`,
        )

        await step(page, '利用者の詳細を開き、「…」から「利用を終了する」を押す', () =>
          openEndDialog(page, patient.id),
        )
        await check(
          page,
          '同じ日に終わる予定は「2030年1月10日（木） 10:00〜11:00」と出て、「翌」が付かない',
          async () => {
            const schedule = page.getByTestId(`patient-end-schedule-${patient.sameDay}`)
            await expect(schedule).toContainText('2030年1月10日（木） 10:00〜11:00')
            await schedule.scrollIntoViewIfNeeded()
          },
        )
      },
    )
  })
})
