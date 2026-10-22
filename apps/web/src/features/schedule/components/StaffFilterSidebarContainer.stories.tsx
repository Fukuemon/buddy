import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  emptyBuddyApi,
  failingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'
import { StaffFilterSidebarContainer } from './StaffFilterSidebarContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule', url: '/schedule', ...appRouter },
})

const meta = {
  title: '画面/Schedule/StaffFilterSidebarContainer',
  component: StaffFilterSidebarContainer,
  decorators: [
    withAppRouter,
    // WithCalendar はカレンダーと並べるので、幅を絞らない
    (Story, { parameters }) =>
      parameters.withCalendar === true ? (
        <Story />
      ) : (
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

/** カレンダーと並べた形。絞り込みのチェックボックスの色と、カレンダーの予定の色を見比べる。 */
export const WithCalendar: Story = {
  parameters: { ...route({ url: '/schedule?view=day' }), layout: 'fullscreen', withCalendar: true },
  render: () => (
    <div className="flex h-[720px]">
      <div className="w-60 shrink-0 border-r border-border">
        <StaffFilterSidebarContainer />
      </div>
      <div className="min-w-0 grow">
        <ScheduleCalendarContainer />
      </div>
    </div>
  ),
}
