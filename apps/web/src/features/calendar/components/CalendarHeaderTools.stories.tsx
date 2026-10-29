import type { Meta, StoryObj } from '@storybook/react-vite'

import { CalendarHeaderTools } from './CalendarHeaderTools'

const meta = {
  title: '画面/Calendar/CalendarHeaderTools',
  component: CalendarHeaderTools,
  args: { reviewCount: 3 },
} satisfies Meta<typeof CalendarHeaderTools>

export default meta
type Story = StoryObj<typeof meta>

/** 確認が必要な予定があるとき。要確認のボタンに件数の印を出す。 */
export const WithReview: Story = {}

/** 確認が必要な予定が無いとき。件数の印を出さない。 */
export const NoReview: Story = { args: { reviewCount: 0 } }

/** 100 件以上あるとき。印を 99+ にする。 */
export const ManyReviews: Story = { args: { reviewCount: 120 } }
