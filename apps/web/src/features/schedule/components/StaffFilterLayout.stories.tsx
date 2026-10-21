import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleCalendarToolbar } from './ScheduleCalendarToolbar'
import { StaffFilterLayout } from './StaffFilterLayout'
import { StaffFilterSidebar } from './StaffFilterSidebar'
import { STORY_DATE, storyStaff, storyTeams } from './storyData'

const meta = {
  title: '画面/Schedule/StaffFilterLayout',
  component: StaffFilterLayout,
  decorators: [
    (Story) => (
      <div className="flex h-[600px] flex-col">
        <Story />
      </div>
    ),
  ],
  // showModal は文書の全体を操作できなくするので、Docs のページでは story ごとに iframe で描く
  parameters: { layout: 'fullscreen', docs: { story: { inline: false, iframeHeight: 600 } } },
  args: {
    staffFilter: (
      <StaffFilterSidebar
        onChange={fn()}
        selectedStaffIds={[]}
        staffList={storyStaff}
        teams={storyTeams}
      />
    ),
    renderCalendar: (staffFilterToggle) => (
      <div className="px-2 py-2 desktop:px-6">
        <ScheduleCalendarToolbar
          date={STORY_DATE}
          onCreate={fn()}
          onDateChange={fn()}
          onNext={fn()}
          onPrev={fn()}
          onToday={fn()}
          onViewChange={fn()}
          staffFilterToggle={staffFilterToggle}
          view="month"
        />
      </div>
    ),
  },
} satisfies Meta<typeof StaffFilterLayout>

export default meta
type Story = StoryObj<typeof meta>

/** 幅 768px 以上。職員の絞り込みを左に常に出す。 */
export const Desktop: Story = {}

/** 幅 768px 未満。職員の絞り込みは閉じたドロワーにあり、ツールバーのボタンで開く。 */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
}

/** 幅 768px 未満で、ツールバーのボタンからドロワーを開いた状態。 */
export const MobileOpen: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    // Docs のページのように幅が 768px 以上で描くときは、開くボタンが無い
    const opener = canvas.queryByTestId('staff-filter-open')
    if (opener !== null) await userEvent.click(opener)
  },
}
