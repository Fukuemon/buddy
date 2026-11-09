import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleWeekAgenda } from './ScheduleWeekAgenda'
import { STORY_DATE, storyAllDayEvents, storyEvents, storyStaff } from './storyData'

const meta = {
  title: '画面/Schedule/ScheduleWeekAgenda',
  component: ScheduleWeekAgenda,
  args: {
    date: STORY_DATE,
    today: STORY_DATE,
    staffList: storyStaff,
    events: storyEvents,
    onDayClick: fn(),
    onEventClick: fn(),
  },
  globals: { viewport: { value: 'mobile2' } },
  decorators: [
    (Story) => (
      <div className="h-[720px] max-w-[390px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScheduleWeekAgenda>

export default meta
type Story = StoryObj<typeof meta>

/** 幅 390px の週の表示。2026年10月18日（日）から 24 日（土）の予定を、日ごとに時刻の順に並べる。 */
export const Default: Story = {}

/** 予定の無い週。日の見出しだけを出す。 */
export const Empty: Story = { args: { events: [] } }

/** Google カレンダーの終日の予定がある週。かかる日ごとに、時刻のある予定の前に「終日」の行を出す。 */
export const AllDay: Story = { args: { allDayEvents: storyAllDayEvents } }
