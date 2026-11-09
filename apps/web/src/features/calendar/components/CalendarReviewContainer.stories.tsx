import type { Meta, StoryObj } from '@storybook/react-vite'

import type { BuddyApi } from '#/api/BuddyApi'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import {
  failOnSecondCall,
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

export const Default: Story = {}

export const Empty: Story = { parameters: route({ api: emptyBuddyApi() }) }

export const Loading: Story = { parameters: route({ api: pendingBuddyApi() }) }

export const LoadError: Story = { parameters: route({ api: failingBuddyApi() }) }

/** 確認が必要な予定を、2 回目だけ読めないフェイクの API を作る。 */
export const refetchFailingApi = (): BuddyApi => {
  const base = createFakeBuddyApi()
  return {
    ...base,
    calendars: {
      ...base.calendars,
      exportIssues: failOnSecondCall((...args) => base.calendars.exportIssues(...args)),
    },
  }
}

/** 読み終えた後に読み直して、確認が必要な予定を読めない。表示を残し、見出しの下に失敗の文と読み直すを出す。 */
export const RefetchError: Story = { parameters: route({ api: refetchFailingApi() }) }
