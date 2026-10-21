import { ApiError, type BuddyApi } from '../client'
import { matchesName } from '../nameSearch'
import type { FacilityId, Schedule } from '../types'
import {
  FAKE_FACILITY_ID,
  createFakeSchedules,
  fakePatients,
  fakeStaff,
  fakeTeams,
} from './fixtures'

/** createFakeBuddyApi の設定。 */
export type FakeBuddyApiOptions = {
  /** 予定の架空のデータを散らす基準の日。既定は呼んだ時の日付。 */
  baseDate?: Date
}

const assertFacility = (facilityId: FacilityId) => {
  if (facilityId !== FAKE_FACILITY_ID) {
    throw new ApiError(403, `事業所 ${facilityId} の操作は許可されていません`)
  }
}

/**
 * メモリの上で動く BuddyApi を作る。データは呼び出しごとに独立し、ページを読み直すと初期の状態に戻る。
 *
 * FAKE_FACILITY_ID 以外の事業所を指すと、status が 403 の ApiError を投げる。
 */
export const createFakeBuddyApi = ({
  baseDate = new Date(),
}: FakeBuddyApiOptions = {}): BuddyApi => {
  const schedules = new Map<Schedule['id'], Schedule>(
    createFakeSchedules(baseDate).map((schedule) => [schedule.id, schedule]),
  )
  let sequence = schedules.size

  const findSchedule = (scheduleId: Schedule['id']) => {
    const schedule = schedules.get(scheduleId)
    if (schedule === undefined) throw new ApiError(404, `予定 ${scheduleId} が見つかりません`)
    return schedule
  }

  return {
    schedules: {
      list: async (facilityId, { from, to, staffIds }) => {
        assertFacility(facilityId)
        const fromTime = Date.parse(from)
        const toTime = Date.parse(to)
        return [...schedules.values()].filter(
          (schedule) =>
            Date.parse(schedule.endsAt) > fromTime &&
            Date.parse(schedule.startsAt) < toTime &&
            (staffIds === undefined ||
              staffIds.length === 0 ||
              staffIds.includes(schedule.staffId)),
        )
      },
      get: async (facilityId, scheduleId) => {
        assertFacility(facilityId)
        return findSchedule(scheduleId)
      },
      create: async (facilityId, input) => {
        assertFacility(facilityId)
        sequence += 1
        const schedule: Schedule = { ...input, id: `schedule-${sequence}`, facilityId }
        schedules.set(schedule.id, schedule)
        return schedule
      },
      update: async (facilityId, scheduleId, input) => {
        assertFacility(facilityId)
        findSchedule(scheduleId)
        const schedule: Schedule = { ...input, id: scheduleId, facilityId }
        schedules.set(scheduleId, schedule)
        return schedule
      },
    },
    staff: {
      list: async (facilityId, params) => {
        assertFacility(facilityId)
        return fakeStaff.filter((staff) => matchesName(staff.name, params))
      },
    },
    teams: {
      list: async (facilityId) => {
        assertFacility(facilityId)
        return fakeTeams
      },
    },
    patients: {
      list: async (facilityId, params) => {
        assertFacility(facilityId)
        return fakePatients.filter((patient) => matchesName(patient.name, params))
      },
    },
  }
}
