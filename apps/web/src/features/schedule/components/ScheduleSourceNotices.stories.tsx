import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleSourceNotices } from './ScheduleSourceNotices'
import {
  STORY_NOW,
  storyCalendarSyncs,
  storyNeedsReview,
  storyNeedsReviewAllDayEvents,
  storyStaff,
  storyUnlistedEventCounts,
} from './storyData'

const meta = {
  title: '画面/Schedule/ScheduleSourceNotices',
  component: ScheduleSourceNotices,
  args: {
    sourceMode: 'google_primary',
    calendarSyncs: storyCalendarSyncs,
    needsReview: storyNeedsReview,
    needsReviewAllDayEvents: storyNeedsReviewAllDayEvents,
    staffList: storyStaff,
    now: STORY_NOW,
    onOpenSchedule: fn(),
  },
} satisfies Meta<typeof ScheduleSourceNotices>

export default meta
type Story = StoryObj<typeof meta>

/** 案内、同期の警告、確認が必要な予定の 3 つを出す。 */
export const Default: Story = {}

/** 全てのカレンダーが 10 分以内に同期でき、確認が必要な予定も無い。案内だけを出す。 */
export const GuideOnly: Story = {
  args: {
    calendarSyncs: storyCalendarSyncs.slice(0, 1),
    needsReview: [],
    needsReviewAllDayEvents: [],
  },
}

/** buddy_primary の事業所。何も出さない。 */
export const BuddyPrimary: Story = {
  args: {
    sourceMode: 'buddy_primary',
    calendarSyncs: [],
    needsReview: [],
    needsReviewAllDayEvents: [],
  },
}

/** 予定の正本を buddy に切り替えている。切り替え中であることと、予定を変えられないことを伝える文と、始めた職員と時刻を出す。 */
export const Cutover: Story = {
  args: {
    calendarSyncs: storyCalendarSyncs.slice(0, 1),
    needsReview: [],
    needsReviewAllDayEvents: [],
    cutover: {
      started_at: '2026-10-05T00:00:00Z',
      started_by: 'staff-manager',
      started_by_name: '佐藤 一郎',
      range_start: '2026-10-01',
    },
  },
}

/** 表示の期間に、カレンダーに出せない予定がある。件数と職員ごとの件数を出し、Google カレンダーで確認するよう促す。 */
export const Unlisted: Story = {
  args: {
    calendarSyncs: storyCalendarSyncs.slice(0, 1),
    needsReview: [],
    needsReviewAllDayEvents: [],
    unlistedEventCounts: storyUnlistedEventCounts,
  },
}
