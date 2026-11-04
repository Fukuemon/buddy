import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleSourceNotices } from './ScheduleSourceNotices'
import { STORY_NOW, storyCalendarSyncs, storyNeedsReview, storyStaff } from './storyData'

const meta = {
  title: '画面/Schedule/ScheduleSourceNotices',
  component: ScheduleSourceNotices,
  args: {
    sourceMode: 'google_primary',
    calendarSyncs: storyCalendarSyncs,
    needsReview: storyNeedsReview,
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
  args: { calendarSyncs: storyCalendarSyncs.slice(0, 1), needsReview: [] },
}

/** buddy_primary の事業所。何も出さない。 */
export const BuddyPrimary: Story = {
  args: { sourceMode: 'buddy_primary', calendarSyncs: [], needsReview: [] },
}

/** 予定の正本を buddy に切り替えている。切り替え中であることと、Google カレンダーで予定を変えないよう頼む文を出す。 */
export const Cutover: Story = {
  args: {
    calendarSyncs: storyCalendarSyncs.slice(0, 1),
    needsReview: [],
    cutover: { started_at: '2026-10-05T00:00:00Z', range_start: '2026-10-01' },
  },
}
