import {
  MOCK_FACILITY_ID,
  createMockSchedules,
  mockMe,
  mockPatients,
  mockStaff,
  mockTeams,
} from '#/mocks/scheduleData'

import {
  fromApiPatient,
  fromApiSchedule,
  fromApiSchedulePolicies,
  fromApiStaff,
  fromApiTeam,
} from '../http/scheduleMapper'
import {
  type FacilityId,
  type Patient,
  type Schedule,
  type Staff,
  type Team,
  type Viewer,
} from '../types'

// ダミーデータの正本は、MSW のフェイクと共有する API の形のデータ（src/mocks/scheduleData.ts）である。
// ここでは、それを本物の API と同じ変換で画面の型にする（ADR-0008）。

/** ローカルで使うダミーの事業所。 */
export const FAKE_FACILITY_ID: FacilityId = MOCK_FACILITY_ID

/** フェイクの API のときにログインしているとみなす職員。 */
export const FAKE_VIEWER: Viewer = {
  staffId: mockMe.id,
  staffName: mockMe.username,
  facilityId: mockMe.facility_id,
  policyCodes: mockMe.policies.map((p) => p.code),
  schedulePolicies: fromApiSchedulePolicies(mockMe.policies),
}

export const fakeTeams: Team[] = mockTeams.map(fromApiTeam)

export const fakeStaff: Staff[] = mockStaff.map(fromApiStaff)

export const fakePatients: Patient[] = mockPatients.map(fromApiPatient)

/** 基準日の前後に散らしたダミーの予定を作る。 */
export const createFakeSchedules = (base: Date): Schedule[] =>
  createMockSchedules(base).map(fromApiSchedule)
