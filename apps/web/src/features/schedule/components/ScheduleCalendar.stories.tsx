import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleCalendar } from './ScheduleCalendar'
import { STORY_DATE, storyEvents } from './storyData'

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
