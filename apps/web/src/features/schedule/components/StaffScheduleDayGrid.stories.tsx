import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { StaffScheduleDayGrid } from './StaffScheduleDayGrid'
import { STORY_DATE, storyAllDayEvents, storyEvents, storyStaff } from './storyData'

const meta = {
  title: '画面/Schedule/StaffScheduleDayGrid',
  component: StaffScheduleDayGrid,
  args: {
    date: STORY_DATE,
    staffList: storyStaff,
    events: storyEvents,
    onSlotClick: fn(),
    onEventClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[720px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaffScheduleDayGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SingleStaff: Story = { args: { staffList: storyStaff.slice(0, 1) } }

/** 前の日の 22 時から 1 時までの夜勤（石川 二葉）の翌日。0 時から 1 時に描く。 */
export const NextDayOfOvernight: Story = { args: { date: '2026-10-21' } }

/** 表示している日が今日のとき。10:15 に今の時刻の線を引く。 */
export const WithNow: Story = { args: { now: new Date(2026, 9, 20, 10, 15) } }

/** Google カレンダーの終日の予定がある日。職員の名前の下に「終日」の欄を出し、青木 一郎の「休み」と石川 二葉の「研修」を置く。 */
export const AllDay: Story = { args: { allDayEvents: storyAllDayEvents } }
