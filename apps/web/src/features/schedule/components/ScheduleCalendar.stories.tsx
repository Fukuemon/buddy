import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleCalendar } from './ScheduleCalendar'
import { STORY_DATE, storyAllDayEvents, storyEvents } from './storyData'

const meta = {
  title: '画面/Schedule/ScheduleCalendar',
  component: ScheduleCalendar,
  args: {
    view: 'month',
    date: STORY_DATE,
    events: storyEvents,
    onDateClick: fn(),
    onEventClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[720px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScheduleCalendar>

export default meta
type Story = StoryObj<typeof meta>

export const Month: Story = {}

export const Week: Story = { args: { view: 'week' } }

export const Empty: Story = { args: { events: [] } }

/** Google カレンダーの終日の予定がある月。日の枠の上に、職員の名前とタイトルを出す。 */
export const MonthAllDay: Story = { args: { allDayEvents: storyAllDayEvents } }

/** Google カレンダーの終日の予定がある週。時刻の格子の上に「終日」の行を出す。 */
export const WeekAllDay: Story = { args: { view: 'week', allDayEvents: storyAllDayEvents } }
