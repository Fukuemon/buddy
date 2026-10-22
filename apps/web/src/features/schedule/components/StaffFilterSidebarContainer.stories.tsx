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
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof StaffFilterSidebarContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 職員の絞り込みの幅（StaffFilterLayout の w-56）にそろえる。 */
const narrow: NonNullable<Story['decorators']> = [
  (Story) => (
    <div className="w-56">
      <Story />
    </div>
  ),
]

export const AllStaff: Story = { decorators: narrow }

export const Selected: Story = {
  decorators: narrow,
  parameters: route({ url: '/schedule?staff=staff-1' }),
}

export const Empty: Story = { decorators: narrow, parameters: route({ api: emptyBuddyApi() }) }

export const Failed: Story = { decorators: narrow, parameters: route({ api: failingBuddyApi() }) }

/** カレンダーと並べた形。絞り込みのチェックボックスの色と、カレンダーの予定の色を見比べる。 */
export const WithCalendar: Story = {
  parameters: { ...route({ url: '/schedule?view=day' }), layout: 'fullscreen' },
  render: () => (
    <div className="flex h-[720px]">
      <div className="w-56 shrink-0 border-r border-border">
        <StaffFilterSidebarContainer />
      </div>
      <div className="min-w-0 grow">
        <ScheduleCalendarContainer />
      </div>
    </div>
  ),
}
