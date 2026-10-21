import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  emptyBuddyApi,
  failingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { StaffFilterSidebarContainer } from './StaffFilterSidebarContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule', url: '/schedule', ...appRouter },
})

const meta = {
  title: '画面/Schedule/StaffFilterSidebarContainer',
  component: StaffFilterSidebarContainer,
  decorators: [
    withAppRouter,
    (Story) => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
  parameters: route({}),
} satisfies Meta<typeof StaffFilterSidebarContainer>

export default meta
type Story = StoryObj<typeof meta>

export const AllStaff: Story = {}

export const Selected: Story = { parameters: route({ url: '/schedule?staff=staff-1' }) }

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }
