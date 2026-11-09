import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleDetailModal } from './ScheduleDetailModal'
import { storyPatients, storySchedules, storyStaff } from './storyData'

const [visit, , normal, , , cancelled] = storySchedules

const meta = {
  title: '画面/Schedule/ScheduleDetailModal',
  component: ScheduleDetailModal,
  args: {
    schedule: visit!,
    staff: storyStaff[0],
    patient: storyPatients[0],
    onEdit: fn(),
    onCancelSchedule: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ScheduleDetailModal>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = {
  args: { schedule: normal!, staff: storyStaff[2], patient: undefined },
}

/** キャンセルした訪問の予定。理由を出し、編集のボタンを出さない。 */
export const Cancelled: Story = {
  args: { schedule: cancelled!, staff: storyStaff[3], patient: storyPatients[2] },
}

/** 隔週の月曜と木曜の、繰り返しの予定のまだ変えていない回。規則を「繰り返し」の行に出し、「編集」をメニューにする。 */
export const Recurring: Story = {
  args: {
    schedule: {
      ...visit!,
      startsAt: '2026-11-09T09:00:00+09:00',
      endsAt: '2026-11-09T09:29:00+09:00',
      recurrence: {
        recurringScheduleId: 'recurring-1',
        rule: {
          frequency: 'weekly',
          daysOfWeek: [1, 4],
          interval: 2,
          dayOfWeek: null,
          dayOfMonth: null,
          weekOfMonth: null,
          endDate: null,
        },
      },
    },
    onChangeRecurrence: fn(),
  },
}

/** 月曜から日曜までの 7 つの曜日を、間隔 interval で繰り返す予定の、2026-11-09 の回の args。 */
const allDaysArgs = (interval: number, endDate: string | null) => ({
  schedule: {
    ...visit!,
    startsAt: '2026-11-09T09:00:00+09:00',
    endsAt: '2026-11-09T09:29:00+09:00',
    recurrence: {
      recurringScheduleId: 'recurring-1',
      rule: {
        frequency: 'weekly' as const,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        interval,
        dayOfWeek: null,
        dayOfMonth: null,
        weekOfMonth: null,
        endDate,
      },
    },
  },
  onChangeRecurrence: fn(),
})

/** 7 つの曜日の毎週で、終了日を 2027-03-31 にした繰り返しの予定の回。毎日の訪問は、ADR-0038 のとおりこの形で持つ。 */
export const RecurringDaily: Story = { args: allDaysArgs(1, '2027-03-31') }

/** 7 つの曜日の隔週の、終了日の無い繰り返しの予定の回。 */
export const RecurringBiweeklyAllDays: Story = { args: allDaysArgs(2, null) }
