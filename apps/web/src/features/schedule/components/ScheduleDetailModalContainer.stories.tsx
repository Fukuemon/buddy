import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleDetailModalContainer } from './ScheduleDetailModalContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule/$scheduleId/', url: '/schedule/schedule-1', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleDetailModalContainer',
  component: ScheduleDetailModalContainer,
  decorators: [withAppRouter],
  // 描くときは、route の params の scheduleId で上書きする。開く予定は parameters.appRouter.url で選ぶ
  args: { scheduleId: '' },
  parameters: route({}),
} satisfies Meta<typeof ScheduleDetailModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = {
  parameters: route({ url: '/schedule/schedule-3' }),
}

export const NotFound: Story = {
  parameters: route({ url: '/schedule/missing' }),
}

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }
