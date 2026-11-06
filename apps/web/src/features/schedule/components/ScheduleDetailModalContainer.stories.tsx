import type { Meta, StoryObj } from '@storybook/react-vite'

import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleDetailModalContainer } from './ScheduleDetailModalContainer'
import { selfEditViewer } from './storyData'

/** 予定の正本を buddy に切り替えている、google_primary の事業所のフェイクの API。 */
const cutoverBuddyApi = () => {
  const api = createFakeBuddyApi({ sourceMode: 'google_primary', calendarSyncs: [] })
  void api.calendars.startCutover(MOCK_FACILITY_ID)
  return api
}

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule/$scheduleId/', url: '/schedule/schedule-1', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleDetailModalContainer',
  component: ScheduleDetailModalContainer,
  decorators: [withAppRouter],
  // 描くときは、route の params の scheduleId で上書きする。開く予定は parameters.appRouter.url で選ぶ
  args: { scheduleId: '' },
  parameters: route({}),
} satisfies Meta<typeof ScheduleDetailModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = {
  parameters: route({ url: '/schedule/schedule-3' }),
}

/** キャンセルした予定。理由を出し、編集のボタンを出さない。 */
export const Cancelled: Story = { parameters: route({ url: '/schedule/schedule-6' }) }

export const NotFound: Story = {
  parameters: route({ url: '/schedule/missing' }),
}

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 編集の権限の外の予定（石川 二葉の予定）。編集のボタンを出さない。 */
export const ReadOnly: Story = {
  parameters: route({ url: '/schedule/schedule-2', viewer: selfEditViewer }),
}

/** 見る権限の無い予定。読み直しても変わらないので、権限が無いことを出す。 */
export const Forbidden: Story = { parameters: route({ api: failingBuddyApi(403) }) }

/** Google カレンダーを予定の正本にする事業所の予定。一覧から引いて出し、buddy で変えると Google カレンダーにも書く案内と、編集とキャンセルのボタンを出す。 */
export const GoogleCalendar: Story = {
  parameters: route({
    url: '/schedule/gcal-schedule-3',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** 確認が必要な Google カレンダーの予定。理由を出す。 */
export const GoogleCalendarNeedsReview: Story = {
  parameters: route({
    url: '/schedule/gcal-review-1',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** 繰り返しの規則を写せない予定。最初の回が表示の期間の外でも、確認が必要な予定から引いて出す。編集とキャンセルのボタンを出さない。 */
export const GoogleCalendarRecurrenceUnsupported: Story = {
  parameters: route({
    url: '/schedule/gcal-review-3',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** 予定の正本を buddy に切り替えている事業所の予定。編集とキャンセルのボタンを出さない。 */
export const GoogleCalendarCutover: Story = {
  parameters: route({ url: '/schedule/gcal-schedule-3', api: cutoverBuddyApi() }),
}
