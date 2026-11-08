import type { Meta, StoryObj } from '@storybook/react-vite'
import { createMemoryHistory } from '@tanstack/react-router'

import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  failingBuddyApi,
  pendingBuddyApi,
  suspendedStaffBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleEditModalContainer } from './ScheduleEditModalContainer'
import { selfEditViewer } from './storyData'

/**
 * google_primary の事業所で、編集を開いた後に Google カレンダーで予定が 1 時間遅れたフェイクの API。
 * 最初の保存を 409（google_event_changed）で拒み、2 回目からの読み出しは、遅れた日時と新しい etag の予定を返す。
 */
const changedInGoogleApi = (): BuddyApi => {
  const api = createFakeBuddyApi({ sourceMode: 'google_primary' })
  let reads = 0
  let rejected = false
  const later = (dateTime: string) => new Date(Date.parse(dateTime) + 60 * 60 * 1000).toISOString()
  return {
    ...api,
    schedules: {
      ...api.schedules,
      get: async (facilityId, scheduleId) => {
        reads += 1
        const schedule = await api.schedules.get(facilityId, scheduleId)
        if (reads === 1) return schedule
        return {
          ...schedule,
          startsAt: later(schedule.startsAt),
          endsAt: later(schedule.endsAt),
          etag: '"etag-latest"',
        }
      },
      update: async (facilityId, scheduleId, input) => {
        if (!rejected) {
          rejected = true
          throw new ApiError(
            409,
            'Google カレンダーで予定が変わっていました。最新の予定を確認してください',
            [],
            'google_event_changed',
          )
        }
        return { ...(await api.schedules.get(facilityId, scheduleId)), ...input }
      },
    },
  }
}

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: {
    route: '/schedule/$scheduleId/edit',
    url: '/schedule/schedule-1/edit',
    ...appRouter,
  },
})

const meta = {
  title: '画面/Schedule/ScheduleEditModalContainer',
  component: ScheduleEditModalContainer,
  decorators: [withAppRouter],
  // 描くときは、route の params の scheduleId で上書きする。開く予定は parameters.appRouter.url で選ぶ
  args: { scheduleId: '' },
  parameters: route({}),
} satisfies Meta<typeof ScheduleEditModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

/** 予定のサービスコード（訪看I4）が、予定の利用者の久保 秋代のサービスコード（訪看I2）と違う訪問の予定。開くと訪看I4 を選んでいる。 */
export const VisitWithOtherServiceCode: Story = {
  parameters: route({ url: '/schedule/schedule-4/edit' }),
}

export const Normal: Story = {
  parameters: route({ url: '/schedule/schedule-3/edit' }),
}

/** キャンセルした予定の編集の URL を直に開いたとき。フォームを出さない。 */
export const Cancelled: Story = { parameters: route({ url: '/schedule/schedule-6/edit' }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const Failed: Story = { parameters: route({ api: failingBuddyApi() }) }

/**
 * 止めた職員（石川 二葉）に割り振った訪問の予定。
 * 主訪問者の要約に名前を出したまま、候補には止めた職員を出さない。
 */
export const SuspendedStaff: Story = {
  parameters: route({ url: '/schedule/schedule-2/edit', api: suspendedStaffBuddyApi() }),
}

/** 編集の権限の外の予定（石川 二葉の予定）の編集を URL で開いた。フォームを出さない。 */
export const Forbidden: Story = {
  parameters: route({ url: '/schedule/schedule-2/edit', viewer: selfEditViewer }),
}

export const NotFound: Story = { parameters: route({ url: '/schedule/missing/edit' }) }

/** Google カレンダーを予定の正本にする事業所の予定。同じフォームを出し、編集を開いたときの etag で保存する。 */
export const GooglePrimary: Story = {
  parameters: route({
    url: '/schedule/gcal-schedule-1/edit',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** カレンダーで予定と別の日を開いた後の、Google カレンダーの予定の編集。保存すると、予定の日のカレンダーで詳細を開く。 */
export const GooglePrimaryFromOtherDay: Story = {
  parameters: route({
    url: '/schedule/gcal-schedule-1/edit?view=day&date=2020-01-06',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
    history: createMemoryHistory({
      initialEntries: ['/schedule/gcal-schedule-1/edit?view=day&date=2020-01-06'],
    }),
  }),
}

/** 編集を開いた後に Google カレンダーで予定が変わった。保存すると、入力を残したまま最新の予定を出す。 */
export const GooglePrimaryChangedInGoogle: Story = {
  parameters: route({ url: '/schedule/gcal-schedule-1/edit', api: changedInGoogleApi() }),
}

/** タイトルの利用者が見つからない、確認が必要な Google カレンダーの予定。予定の種類のタブを出し、訪問にして訪問の情報を足せる。 */
export const GooglePrimaryNeedsReview: Story = {
  parameters: route({
    url: '/schedule/gcal-review-1/edit',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}

/** 繰り返しの規則を buddy で表せない Google カレンダーの予定。フォームを出さずに、変えられないことを出す。 */
export const GooglePrimaryRecurrenceUnsupported: Story = {
  parameters: route({
    url: '/schedule/gcal-review-3/edit',
    api: createFakeBuddyApi({ sourceMode: 'google_primary' }),
  }),
}
