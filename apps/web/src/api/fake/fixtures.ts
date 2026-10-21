import {
  MOCK_FACILITY_ID,
  createMockSchedules,
  mockMe,
  mockPatients,
  mockStaff,
  mockTeams,
} from '#/mocks/scheduleData'

import { fromApiPatient, fromApiSchedule, fromApiStaff, fromApiTeam } from '../http/scheduleMapper'
import type { FacilityId, Patient, Schedule, Staff, Team, Viewer } from '../types'

// 架空のデータの正本は、MSW の偽物と共有する API の形のデータ（src/mocks/scheduleData.ts）である。
// ここでは、それを本物の API と同じ変換で画面の型にする（ADR-0008）。

/** 手元で使う架空の事業所。 */
export const FAKE_FACILITY_ID: FacilityId = MOCK_FACILITY_ID

/** 偽物の API のときにログインしているとみなす職員。 */
export const FAKE_VIEWER: Viewer = {
  staffId: mockMe.id,
  staffName: mockMe.username,
  facilityId: mockMe.facility_id,
}

export const fakeTeams: Team[] = mockTeams.map(fromApiTeam)

export const fakeStaff: Staff[] = mockStaff.map(fromApiStaff)

export const fakePatients: Patient[] = mockPatients.map(fromApiPatient)

/** 基準日の前後に散らした架空の予定を作る。 */
export const createFakeSchedules = (base: Date): Schedule[] =>
  createMockSchedules(base).map(fromApiSchedule)
