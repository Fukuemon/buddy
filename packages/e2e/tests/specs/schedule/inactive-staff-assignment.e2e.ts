import { expect, test, type APIRequestContext } from '@playwright/test'

import { LOGIN_STAFF } from '../../fixtures/env'
import { findSchedule } from '../../fixtures/externalCalendar'
import { registerPatient } from '../../fixtures/patient'
import {
  createNormalSchedule,
  createWeeklyNormalSchedule,
  getSchedule,
  updateNormalSchedule,
} from '../../fixtures/schedule'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaff,
  retireStaff,
  STAFF_FORM,
} from '../../fixtures/staff'

/** 予定の API で作る予定の日。 */
const SCHEDULE_DATE = '2026-10-20'

/** 今日より後の予定の日。 */
const FUTURE_DATE = '2030-01-07'

/** 休職か退職にする操作。 */
const STOPS = [
  {
    label: '休職の職員',
    stop: leaveStaff,
    message: /^休職の職員 .+ には、予定と担当を割り振れません$/,
  },
  {
    label: '退職した職員',
    stop: retireStaff,
    message: /^退職した職員 .+ には、予定と担当を割り振れません$/,
  },
] as const

/** 職員を 1 人登録し、ID と名前を返す。 */
const register = async (request: APIRequestContext, token: string, label: string) => {
  const staff = newStaff(label)
  const registered = await registerStaff(request, token, staff)
  expect(registered.status()).toBe(201)
  return { id: ((await registered.json()) as { id: string }).id, name: staff.name }
}

/** 職員を 1 人登録して stop で休職か退職にし、ID と名前を返す。 */
const registerStopped = async (
  request: APIRequestContext,
  token: string,
  stop: (typeof STOPS)[number]['stop'],
) => {
  const staff = await register(request, token, 'stopped')
  expect((await stop(request, token, staff.id)).status()).toBe(200)
  return staff
}

test.describe('予定の作成', () => {
  test.describe('休職と退職の職員への割り振り', () => {
    test('URL の staffId が休職の職員を指す予定の作成の画面を開いた場合、担当者が未選択で開くこと', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const stopped = await registerStopped(request, manager, leaveStaff)

      await page.goto(`/schedule/new?start=${SCHEDULE_DATE}&time=13:00&staffId=${stopped.id}`)
      // 職員の一覧が届くまで担当者は値に関わらず未選択に見えるので、候補が出てから確認する
      await page.getByTestId('schedule-field-staff').click()
      await expect(page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`)).toBeVisible()

      await expect(page.getByTestId('schedule-field-staff')).toContainText('選んでください')
      await expect(page.getByTestId('schedule-field-staff')).not.toContainText(stopped.name)
    })

    for (const { label, stop, message } of STOPS) {
      test(`${label}を指して予定を作ろうとした場合、400 が返り予定ができないこと`, async ({
        request,
      }) => {
        const manager = await issueManagerToken(request)
        const stopped = await registerStopped(request, manager, stop)
        const title = `E2E の会議 ${Date.now()}`

        const res = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
          staffId: stopped.id,
          title,
          date: SCHEDULE_DATE,
        })

        expect(res.status()).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'invalid_input', message })
        expect(
          await findSchedule(request, manager, STAFF_FORM.facilityId, {
            date: SCHEDULE_DATE,
            title,
          }),
        ).toBeUndefined()
      })

      test(`${label}を指して繰り返しの予定を作ろうとした場合、400 が返ること`, async ({
        request,
      }) => {
        const manager = await issueManagerToken(request)
        const stopped = await registerStopped(request, manager, stop)

        const res = await createWeeklyNormalSchedule(request, manager, STAFF_FORM.facilityId, {
          staffId: stopped.id,
          title: `E2E の定例 ${Date.now()}`,
          date: SCHEDULE_DATE,
        })

        expect(res.status()).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'invalid_input', message })
      })
    }
  })
})

test.describe('予定の編集', () => {
  test.describe('休職と退職の職員への割り振り', () => {
    for (const { label, stop, message } of STOPS) {
      test(`予定の職員を${label}に変えようとした場合、400 が返り予定の職員が変わらないこと`, async ({
        request,
      }) => {
        const manager = await issueManagerToken(request)
        const stamp = Date.now()
        const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
          staffId: LOGIN_STAFF.id,
          title: `E2E の会議 ${stamp}`,
          date: SCHEDULE_DATE,
        })
        expect(created.status()).toBe(201)
        const scheduleId = ((await created.json()) as { id: string }).id
        const stopped = await registerStopped(request, manager, stop)

        const res = await updateNormalSchedule(request, manager, scheduleId, {
          staffId: stopped.id,
          title: `E2E の会議 ${stamp}`,
          date: SCHEDULE_DATE,
        })

        expect(res.status()).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'invalid_input', message })
        const saved = await getSchedule(request, manager, scheduleId)
        expect(await saved.json()).toMatchObject({ staff_id: LOGIN_STAFF.id })
      })
    }

    test('退職した職員の過去の予定を、職員を変えずに今日以降の日付へ動かそうとした場合、400 が返ること', async ({
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const assigned = await register(request, manager, 'retired-past')
      const title = `E2E の会議 ${Date.now()}`
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: assigned.id,
        title,
        date: SCHEDULE_DATE,
      })
      expect(created.status()).toBe(201)
      const scheduleId = ((await created.json()) as { id: string }).id
      // 退職は、その日より前の予定だけが残る職員なら拒まない
      expect((await retireStaff(request, manager, assigned.id)).status()).toBe(200)

      const kept = await updateNormalSchedule(request, manager, scheduleId, {
        staffId: assigned.id,
        title: `${title}（変更）`,
        date: SCHEDULE_DATE,
      })
      const moved = await updateNormalSchedule(request, manager, scheduleId, {
        staffId: assigned.id,
        title,
        date: FUTURE_DATE,
      })

      expect(kept.status()).toBe(200)
      expect(moved.status()).toBe(400)
      expect(await moved.json()).toMatchObject({
        code: 'invalid_input',
        message: STOPS[1].message,
      })
    })
  })
})

test.describe('利用者の登録', () => {
  test.describe('休職と退職の職員への割り振り', () => {
    for (const { label, stop, message } of STOPS) {
      test(`担当を${label}にして利用者を登録しようとした場合、400 が返ること`, async ({
        request,
      }) => {
        const manager = await issueManagerToken(request)
        const stopped = await registerStopped(request, manager, stop)

        const res = await registerPatient(request, manager, STAFF_FORM.facilityId, {
          name: `E2E 利用者 ${Date.now()}`,
          assignedStaffId: stopped.id,
        })

        expect(res.status()).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'invalid_input', message })
      })
    }
  })
})
