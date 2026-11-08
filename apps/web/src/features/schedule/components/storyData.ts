import {
  FAKE_VIEWER,
  createFakeSchedules,
  fakePatients,
  fakeStaffList,
  fakeTeams,
} from '#/api/fake/fixtures'
import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import type { RecurringRule, Viewer } from '#/api/types'
import { fromApiSchedule } from '#/api/http/scheduleMapper'
import {
  createMockCalendarSyncs,
  createMockProjectionSchedules,
  mockServiceCodes,
} from '#/mocks/scheduleData'

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

/** google_primary の事業所で、同期が写した Google カレンダーの予定。確認が必要な予定を 3 件含む。 */
export const storyProjectionSchedules = createMockProjectionSchedules(new Date(2026, 9, 20)).map(
  fromApiSchedule,
)
/** storyProjectionSchedules のうち、確認が必要な予定。 */
export const storyNeedsReview = storyProjectionSchedules.filter((s) => s.reviewReason !== undefined)
/** story の今の時刻。 */
export const STORY_NOW = new Date(2026, 9, 20, 10, 0)
/** google_primary の事業所の同期の状況。STORY_NOW の時点で、石川 二葉は同期に失敗し、上田 三奈はまだ同期していない。 */
export const storyCalendarSyncs = createMockCalendarSyncs(STORY_NOW)

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

const DAY_MS = 24 * 60 * 60 * 1000

/** 今日（Asia/Tokyo）から days 日後の YYYY-MM-DD。 */
export const tokyoDateFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * DAY_MS).toISOString().slice(0, 10)

/** 毎週の、終了日の無い繰り返しの規則。曜日は最初の日付から決まる。 */
export const WEEKLY_RULE: RecurringRule = {
  frequency: 'weekly',
  dayOfWeek: null,
  dayOfMonth: null,
  weekOfMonth: null,
  endDate: null,
}

/**
 * 今日から days 日後の、繰り返しの予定の回（訪問の予定の schedule-1 を写したもの）を、どの ID でも読むフェイクの API。
 * replaced なら、1 回を置き換えた予定にする。画面は単発の予定として扱うので、recurrence を持たない。規則の変更は、適用の日を最初の日付にした新しい繰り返しの予定を返す。
 * 予定の詳細、編集、繰り返しの変更は同じ 1 件の取得で読むので、どの story でも同じ回を出す。
 */
export const recurringOccurrenceApi = (
  days: number,
  { rule = WEEKLY_RULE, replaced = false }: { rule?: RecurringRule; replaced?: boolean } = {},
): BuddyApi => {
  const api = createFakeBuddyApi()
  const date = tokyoDateFromToday(days)
  return {
    ...api,
    schedules: {
      ...api.schedules,
      get: async (facilityId, scheduleId) => ({
        ...(await api.schedules.get(facilityId, 'schedule-1')),
        id: scheduleId,
        startsAt: `${date}T09:00:00+09:00`,
        endsAt: `${date}T09:29:00+09:00`,
        ...(replaced ? {} : { recurrence: { recurringScheduleId: 'recurring-1', rule } }),
      }),
      changeRule: async (_facilityId, _recurringScheduleId, change) => ({
        id: change.id,
        date: change.effectiveDate,
      }),
    },
  }
}
