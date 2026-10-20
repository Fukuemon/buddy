import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleCalendarToolbar } from './ScheduleCalendarToolbar'
import { STORY_DATE } from './storyData'

const meta = {
  title: 'Schedule/ScheduleCalendarToolbar',
  component: ScheduleCalendarToolbar,
  args: {
    view: 'month',
    date: STORY_DATE,
    onPrev: fn(),
    onNext: fn(),
    onToday: fn(),
    onViewChange: fn(),
    onDateChange: fn(),
    onCreate: fn(),
  },
} satisfies Meta<typeof ScheduleCalendarToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DayView: Story = { args: { view: 'day' } }

export const WithoutCreate: Story = { args: { onCreate: undefined } }
