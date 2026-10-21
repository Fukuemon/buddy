import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarRewriteDialog } from './CalendarRewriteDialog'

const meta = {
  title: '画面/Calendar/CalendarRewriteDialog',
  component: CalendarRewriteDialog,
  args: {
    target: '2026/11/04（水）09:00〜09:29、青木 一郎',
    isSubmitting: false,
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CalendarRewriteDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Submitting: Story = { args: { isSubmitting: true } }

export const Failed: Story = {
  args: {
    errorMessage:
      'この予定は、すでに書き直す待ちにしたか、書き出し終えています。一覧を読み直してください。',
  },
}
