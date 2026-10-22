import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule', url: '/schedule', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleCalendarContainer',
  component: ScheduleCalendarContainer,
  decorators: [
    withAppRouter,
    (Story) => (
      <div className="h-[720px]">
        <Story />
      </div>
    ),
  ],
  parameters: route({}),
} satisfies Meta<typeof ScheduleCalendarContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Month: Story = {}

export const Week: Story = { parameters: route({ url: '/schedule?view=week' }) }

export const Day: Story = { parameters: route({ url: '/schedule?view=day' }) }

/** キャンセルした予定を出す切り替えを入れた日の表示。 */
export const DayWithCancelled: Story = {
  parameters: route({ url: '/schedule?view=day&cancelled=true' }),
}

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }
