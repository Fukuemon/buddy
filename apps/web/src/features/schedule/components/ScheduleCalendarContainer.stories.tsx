import type { Meta, StoryObj } from '@storybook/react-vite'

import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import {
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'
import { selfEditViewer } from './storyData'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule', url: '/schedule', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleCalendarContainer',
  component: ScheduleCalendarContainer,
  decorators: [
    withAppRouter,
    (Story) => (
      <div className="h-[720px]">
        <Story />
      </div>
    ),
  ],
  parameters: route({}),
} satisfies Meta<typeof ScheduleCalendarContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Month: Story = {}

export const Week: Story = { parameters: route({ url: '/schedule?view=week' }) }

export const Day: Story = { parameters: route({ url: '/schedule?view=day' }) }

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 自分の予定だけを編集でき、A チームの予定を見られる職員。A チームの列だけを出し、「予定を作成」を出し、自分の列の枠だけを押せる。 */
export const DaySelfEditOnly: Story = {
  parameters: route({ url: '/schedule?view=day', viewer: selfEditViewer }),
}

/**
 * Google カレンダーを予定の正本にする事業所。「予定を作成」を出し、カレンダーの上に、buddy と Google カレンダーのどちらでも作成、変更できる案内、
 * 同期の警告（石川 二葉は失敗、上田 三奈は未同期）、確認が必要な予定の 3 件を出す。予定には「要確認」の印を付ける。
 */
export const GooglePrimary: Story = {
  parameters: route({ api: createFakeBuddyApi({ sourceMode: 'google_primary' }) }),
}

/** Google カレンダーを予定の正本にする事業所の日の表示。時間の枠を押して予定を作れる。 */
export const GooglePrimaryDay: Story = {
  parameters: route({
    url: '/schedule?view=day',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** 予定の正本を buddy に切り替えている事業所の日の表示。「予定を作成」を出さず、時間の枠を押して予定を作れない。 */
export const GooglePrimaryCutoverDay: Story = {
  parameters: route({
    url: '/schedule?view=day',
    api: (() => {
      const api = createFakeBuddyApi({ sourceMode: 'google_primary', calendarSyncs: [] })
      void api.calendars.startCutover(MOCK_FACILITY_ID)
      return api
    })(),
  }),
}
