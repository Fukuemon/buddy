import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  emptyBuddyApi,
  failingBuddyApi,
  suspendedStaffBuddyApi,
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

/** 職員の絞り込みの幅（StaffFilterLayout の w-80）にそろえる。 */
const narrow: NonNullable<Story['decorators']> = [
  (Story) => (
    <div className="w-80">
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
      <div className="w-80 shrink-0 border-r border-border">
        <StaffFilterSidebarContainer />
      </div>
      <div className="min-w-0 grow">
        <ScheduleCalendarContainer />
      </div>
    </div>
  ),
}

/** 止めた職員（石川 二葉）がいる事業所。絞り込みとカレンダーに、止めた職員と、その予定を出さない。 */
export const WithSuspendedStaff: Story = {
  ...WithCalendar,
  parameters: {
    ...route({ url: '/schedule?view=day', api: suspendedStaffBuddyApi() }),
    layout: 'fullscreen',
  },
}

/** URL の staff に、止めた職員（石川 二葉）の ID が残っている。止める前に作ったブックマークで開いた形。 */
export const WithSuspendedStaffSelected: Story = {
  ...WithCalendar,
  parameters: {
    ...route({
      url: '/schedule?view=day&staff=%5B%22staff-1%22%2C%22staff-2%22%5D',
      api: suspendedStaffBuddyApi(),
    }),
    layout: 'fullscreen',
  },
}

/** 止めた職員がいる事業所の週の表示。止めた職員の予定を出さない。 */
export const WithSuspendedStaffWeek: Story = {
  ...WithCalendar,
  parameters: {
    ...route({ url: '/schedule?view=week', api: suspendedStaffBuddyApi() }),
    layout: 'fullscreen',
  },
}
