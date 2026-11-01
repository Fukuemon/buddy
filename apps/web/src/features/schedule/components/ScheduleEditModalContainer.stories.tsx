import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  failingBuddyApi,
  pendingBuddyApi,
  suspendedStaffBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleEditModalContainer } from './ScheduleEditModalContainer'
import { selfEditViewer } from './storyData'

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
