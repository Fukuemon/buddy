import {
  FAKE_VIEWER,
  createFakeSchedules,
  fakePatients,
  fakeStaffList,
  fakeTeams,
} from '#/api/fake/fixtures'
import type { Viewer } from '#/api/types'
import { mockServiceCodes } from '#/mocks/scheduleData'

import { toCalendarEvents } from '../lib/toCalendarEvents'

/** story とテストで使う基準の日。 */
export const STORY_DATE = '2026-10-20'

export const storySchedules = createFakeSchedules(new Date(2026, 9, 20))
export const storyStaff = fakeStaffList
export const storyTeams = fakeTeams
export const storyPatients = fakePatients
/** 予定の API のサービスコードの一覧。予定の API のマイグレーションと同じ表記と並びである。 */
export const storyServiceCodes = mockServiceCodes
export const storyEvents = toCalendarEvents(storySchedules, storyStaff, storyPatients)

/** 自分の予定だけを編集でき、A チームの予定を見られる、ログインした職員（青木 一郎）。 */
export const selfEditViewer: Viewer = {
  ...FAKE_VIEWER,
  schedulePolicies: [
    { code: 'schedule.self.edit', targetStaffIds: [], targetTeamIds: [] },
    { code: 'schedule.team.read', targetStaffIds: [], targetTeamIds: ['team-a'] },
  ],
}

/** 予定の権限を持たない、ログインした職員（青木 一郎）。自分の予定だけを見られる。 */
export const noSchedulePolicyViewer: Viewer = { ...FAKE_VIEWER, schedulePolicies: [] }
