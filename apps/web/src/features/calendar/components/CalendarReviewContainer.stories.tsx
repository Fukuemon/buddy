import type { Meta, StoryObj } from '@storybook/react-vite'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
import {
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { CalendarReviewContainer } from './CalendarReviewContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule_/review', url: '/schedule/review', ...appRouter },
})

const meta = {
  title: '画面/Calendar/CalendarReviewContainer',
  component: CalendarReviewContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof CalendarReviewContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 職員の管理の権限を持たない職員。API を呼ばない。 */
export const Forbidden: Story = {
  parameters: route({
    api: failingBuddyApi(),
    viewer: { ...FAKE_VIEWER, canManageStaff: false },
  }),
}
