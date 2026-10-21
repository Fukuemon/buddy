import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleEditModalContainer } from './ScheduleEditModalContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: {
    route: '/schedule/$scheduleId/edit',
    url: '/schedule/schedule-1/edit',
    ...appRouter,
  },
})

const meta = {
  title: '画面/Schedule/ScheduleEditModalContainer',
  component: ScheduleEditModalContainer,
  decorators: [withAppRouter],
  args: { scheduleId: 'schedule-1' },
  parameters: route({}),
} satisfies Meta<typeof ScheduleEditModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = {
  args: { scheduleId: 'schedule-3' },
  parameters: route({ url: '/schedule/schedule-3/edit' }),
}

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }
