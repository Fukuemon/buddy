import type { Meta, StoryObj } from '@storybook/react-vite'

import { CalendarReviewBadge } from './CalendarReviewBadge'

const meta = {
  title: '画面/Calendar/CalendarReviewBadge',
  component: CalendarReviewBadge,
  args: { reviewCount: 3 },
} satisfies Meta<typeof CalendarReviewBadge>

export default meta
type Story = StoryObj<typeof meta>

/** 確認が必要な予定があるとき。件数の印を出す。 */
export const WithReview: Story = {}

/** 確認が必要な予定が無いとき。印を出さない。 */
export const NoReview: Story = { args: { reviewCount: 0 } }

/** 100 件以上あるとき。印を 99+ にする。 */
export const ManyReviews: Story = { args: { reviewCount: 120 } }
