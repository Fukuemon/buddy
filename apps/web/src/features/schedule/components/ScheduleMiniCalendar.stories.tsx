import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleMiniCalendar } from './ScheduleMiniCalendar'
import { STORY_DATE } from './storyData'

const meta = {
  title: '画面/Schedule/ScheduleMiniCalendar',
  component: ScheduleMiniCalendar,
  decorators: [
    (Story) => (
      <div className="w-80 p-2">
        <Story />
      </div>
    ),
  ],
  args: { view: 'week', date: STORY_DATE, today: STORY_DATE, onSelect: fn() },
} satisfies Meta<typeof ScheduleMiniCalendar>

export default meta
type Story = StoryObj<typeof meta>

/** 週の表示。カレンダーが出している 7 日に面の色が付く。 */
export const Week: Story = {}

/** 日の表示。 */
export const Day: Story = { args: { view: 'day' } }

/** 月の表示。期間の面の色は付けず、今日の印だけを出す。 */
export const Month: Story = { args: { view: 'month' } }
