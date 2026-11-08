import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import {
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleDetailModalContainer } from './ScheduleDetailModalContainer'
import { recurringOccurrenceApi, selfEditViewer } from './storyData'

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

/** 「編集」のメニューを開く。 */
const openEditMenu = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement.ownerDocument.body)
  await userEvent.click(await canvas.findByTestId('schedule-detail-edit'))
}

/** 明日の、繰り返しの予定の回。「編集」を押すと、「この予定を編集」と「繰り返しを変更」のメニューを出す。 */
export const RecurringOccurrence: Story = {
  parameters: route({ url: '/schedule/recurring-occurrence', api: recurringOccurrenceApi(1) }),
}

/** 明日の回で「編集」のメニューを開いた。どちらの項目も押せる。 */
export const RecurringOccurrenceMenu: Story = {
  parameters: route({ url: '/schedule/recurring-occurrence', api: recurringOccurrenceApi(1) }),
  play: openEditMenu,
}

/** 昨日の回で「編集」のメニューを開いた。今日より前の回でも、どちらの項目も押せる（繰り返しの変更は今日から当てる）。 */
export const RecurringPastMenu: Story = {
  parameters: route({ url: '/schedule/recurring-occurrence', api: recurringOccurrenceApi(-1) }),
  play: openEditMenu,
}

/** 1 回を置き換えた予定。単発の予定として扱い、メニューにせず「編集」のボタンだけを出す。 */
export const RecurringReplaced: Story = {
  parameters: route({
    url: '/schedule/replaced-occurrence',
    api: recurringOccurrenceApi(1, { replaced: true }),
  }),
}
