import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import type { CalendarSyncStatus } from '#/api/types'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import {
  failOnSecondCall,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { CalendarCutoverContainer } from './CalendarCutoverContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule_/link_/cutover', url: '/schedule/link/cutover', ...appRouter },
})

const synced = (id: string, staffId: string, name: string): CalendarSyncStatus => ({
  external_calendar_id: id,
  staff_id: staffId,
  staff_name: name,
  last_status: 'succeeded',
  last_succeeded_at: '2026-11-05T00:59:00Z',
  last_error: null,
})

/** Google カレンダーを予定の正本にし、結び付けた 2 人のカレンダーの最後の同期が成功している事業所のフェイクの API。 */
const googlePrimaryApi = (): BuddyApi =>
  createFakeBuddyApi({
    baseDate: new Date('2026-11-05T09:00:00+09:00'),
    sourceMode: 'google_primary',
    calendarSyncs: [
      synced('calendar-1', 'staff-1', '青木 一郎'),
      synced('calendar-2', 'staff-2', '石川 二葉'),
    ],
  })

/** 切り替えを始めたフェイクの API。startCutover は待たずに状態を変える。 */
const openApi = (): BuddyApi => {
  const api = googlePrimaryApi()
  void api.calendars.startCutover(MOCK_FACILITY_ID)
  return api
}

const meta = {
  title: '画面/Calendar/CalendarCutoverContainer',
  component: CalendarCutoverContainer,
  decorators: [withAppRouter],
  parameters: route({ api: googlePrimaryApi() }),
} satisfies Meta<typeof CalendarCutoverContainer>

export default meta
type Story = StoryObj<typeof meta>

/** Google カレンダーを正本にし、切り替えを始めていない。手順、同期の状況、始めるボタンを出す。 */
export const NotStarted: Story = {}

/** 最後の同期が成功していないカレンダーがあり、始めると拒まれる。 */
export const SyncNotReady: Story = {
  parameters: route({ api: createFakeBuddyApi({ sourceMode: 'google_primary' }) }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByTestId('calendar-cutover-start'))
    await canvas.findByTestId('calendar-cutover-start-error')
  },
}

/** 切り替え中。職員ごとの取り込みと同期の状況と、完了とやめるのボタンを出す。 */
export const Open: Story = { parameters: route({ api: openApi() }) }

/** 取り込んでいないカレンダーがあり、完了すると満たさない一覧を出す。 */
export const Incomplete: Story = {
  parameters: route({ api: openApi() }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByTestId('calendar-cutover-complete'))
    await canvas.findByTestId('calendar-cutover-unmet')
  },
}

/** やめる前の確認のダイアログ。 */
export const CancelConfirm: Story = {
  parameters: route({ api: openApi() }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByTestId('calendar-cutover-cancel'))
    await within(canvasElement.ownerDocument.body).findByTestId(
      'calendar-cutover-cancel-confirm-dialog',
    )
  },
}

/** 予定の正本が buddy の事業所。 */
export const BuddyPrimary: Story = { parameters: route({ api: createFakeBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 切り替えの状況を、2 回目だけ読めないフェイクの API を作る。 */
export const refetchFailingApi = (): BuddyApi => {
  const base = googlePrimaryApi()
  return {
    ...base,
    calendars: {
      ...base.calendars,
      cutoverStatus: failOnSecondCall((...args) => base.calendars.cutoverStatus(...args)),
    },
  }
}

/** 読み終えた後に読み直して、切り替えの状況を読めない。表示を残し、見出しの下に失敗の文と読み直すを出す。 */
export const RefetchError: Story = { parameters: route({ api: refetchFailingApi() }) }
