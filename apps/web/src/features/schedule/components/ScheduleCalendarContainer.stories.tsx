import type { Meta, StoryObj } from '@storybook/react-vite'

import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import {
  failOnSecondCall,
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'
import { selfEditViewer, storyStaff } from './storyData'

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

/** 2 人目の職員（staff-2）でログインした日の表示。その職員の列を左端に置く。 */
export const DayAsSecondStaff: Story = {
  parameters: route({
    url: '/schedule?view=day',
    viewer: { ...FAKE_VIEWER, staffId: storyStaff[1]!.id, staffName: storyStaff[1]!.name },
  }),
}

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 自分の予定だけを編集でき、A チームの予定を見られる職員。A チームの列だけを出し、「予定を作成」を出し、自分の列の枠だけを押せる。 */
export const DaySelfEditOnly: Story = {
  parameters: route({ url: '/schedule?view=day', viewer: selfEditViewer }),
}

/**
 * 予定を Google カレンダーで管理している事業所。「予定を作成」を出し、カレンダーの上に、buddy と Google カレンダーのどちらでも作成、変更できる案内、
 * 同期の警告（石川 二葉は失敗、上田 三奈は未同期）、確認が必要な予定の 3 件を出す。予定には「要確認」の印を付ける。
 */
export const GooglePrimary: Story = {
  parameters: route({ api: createFakeBuddyApi({ sourceMode: 'google_primary' }) }),
}

/** 予定を Google カレンダーで管理している事業所の日の表示。時間の枠を押して予定を作れる。 */
export const GooglePrimaryDay: Story = {
  parameters: route({
    url: '/schedule?view=day',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** 予定の管理を buddy に移している事業所の日の表示。「予定を作成」を出さず、時間の枠を押して予定を作れない。 */
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

/** 予定を、2 回目だけ読めないフェイクの API を作る。 */
export const refetchFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    schedules: {
      ...base.schedules,
      list: failOnSecondCall((facilityId, params) => base.schedules.list(facilityId, params)),
    },
  }
}

/** 読み終えた後に読み直して、予定を読めない。表示を残し、見出しの下に失敗の文と読み直すを出す。 */
export const RefetchError: Story = { parameters: route({ api: refetchFailingApi() }) }
