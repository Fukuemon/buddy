import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApiError } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  emptyBuddyApi,
  failingBuddyApi,
  pendingBuddyApi,
  withAppRouter,
  type AppRouterParameters,
} from '#/storybook/withAppRouter'

import { CalendarReviewContainer } from './CalendarReviewContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule_/review', url: '/schedule/review', ...appRouter },
})

const meta = {
  title: '画面/Calendar/CalendarReviewContainer',
  component: CalendarReviewContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof CalendarReviewContainer>

export default meta
type Story = StoryObj<typeof meta>

/** buddy_primary の事業所。予定の API が Google の内容に合わせる操作を拒むので、そのボタンを出さない。 */
export const Default: Story = {}

/** google_primary の事業所。Google の内容に合わせられる予定に、そのボタンを出す。 */
export const GooglePrimary: Story = {
  parameters: route({ api: createFakeBuddyApi({ sourceMode: 'google_primary' }) }),
}

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

const unappliable = createFakeBuddyApi({ sourceMode: 'google_primary' })

/** Google の内容に合わせると、Google の予定を buddy の予定に読み替えられずに失敗する。 */
export const AcceptFailed: Story = {
  parameters: route({
    api: {
      ...unappliable,
      calendars: {
        ...unappliable.calendars,
        acceptExport: async () => {
          throw new ApiError(
            409,
            'Google カレンダーの予定を、buddy の予定に読み替えられません',
            [],
            'external_change_unappliable',
          )
        },
      },
    },
  }),
}
