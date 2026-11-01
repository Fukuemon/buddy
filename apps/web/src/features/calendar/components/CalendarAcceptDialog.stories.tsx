import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarAcceptDialog } from './CalendarAcceptDialog'

const meta = {
  title: '画面/Calendar/CalendarAcceptDialog',
  component: CalendarAcceptDialog,
  args: {
    target: '2026/11/04（水）09:00〜09:29、青木 一郎',
    isSubmitting: false,
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CalendarAcceptDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Submitting: Story = { args: { isSubmitting: true } }

export const Failed: Story = {
  args: {
    errorMessage:
      'Google カレンダーの予定を、buddy の予定として取り込めません。終日の予定か、タイトルの利用者が見つからない予定です。buddy の内容で書き直すか、Google カレンダーで直すよう職員に頼んでください。',
  },
}
