import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarRewriteDialog } from './CalendarRewriteDialog'

const meta = {
  title: '画面/Calendar/CalendarRewriteDialog',
  component: CalendarRewriteDialog,
  args: {
    target: '2026年11月4日（水） 09:00〜09:29、青木 一郎',
    isSubmitting: false,
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CalendarRewriteDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** buddy でキャンセルした単発の予定。書き直すと Google カレンダーの予定を消す。 */
export const Cancelled: Story = {
  args: { target: '2026年11月6日（金） 15:00〜16:29、江藤 四郎', isCancelled: true },
}

export const Submitting: Story = { args: { isSubmitting: true } }

export const Failed: Story = {
  args: {
    errorMessage:
      'この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。',
  },
}
