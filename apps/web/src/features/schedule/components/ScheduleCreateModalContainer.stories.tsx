import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  failingBuddyApi,
  pendingBuddyApi,
  suspendedStaffBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { ScheduleCreateModalContainer } from './ScheduleCreateModalContainer'
import { selfEditViewer } from './storyData'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule/new', url: '/schedule/new', ...appRouter },
})

const meta = {
  title: '画面/Schedule/ScheduleCreateModalContainer',
  component: ScheduleCreateModalContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof ScheduleCreateModalContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = { parameters: route({ url: '/schedule/new?kind=normal' }) }

export const FromSlot: Story = {
  parameters: route({ url: '/schedule/new?start=2026-10-21&time=13:00&staffId=staff-2' }),
}

export const ListFailed: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 止めた職員（石川 二葉）がいる事業所。主訪問者の候補に、止めた職員を出さない。 */
export const WithSuspendedStaff: Story = { parameters: route({ api: suspendedStaffBuddyApi() }) }

/** 休職の職員（石川 二葉）の列から開いた URL。主訪問者を未選択で開く。 */
export const FromOnLeaveStaffSlot: Story = {
  parameters: route({
    api: suspendedStaffBuddyApi(),
    url: '/schedule/new?start=2026-10-21&time=13:00&staffId=staff-2',
  }),
}

/** 職員と利用者の一覧を読んでいる間。 */
export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

/** 自分の予定だけを編集できる職員。主訪問者の候補は自分だけになる。 */
export const SelfEditOnly: Story = { parameters: route({ viewer: selfEditViewer }) }
