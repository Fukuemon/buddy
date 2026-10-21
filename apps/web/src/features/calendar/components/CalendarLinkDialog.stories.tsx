import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarLinkDialog } from './CalendarLinkDialog'

const meta = {
  title: '画面/Calendar/CalendarLinkDialog',
  component: CalendarLinkDialog,
  args: {
    staffName: '上田 三奈',
    calendarId: 'staff-3@example.com',
    onCalendarIdChange: fn(),
    checkStatus: 'idle',
    isSubmitting: false,
    onCheck: fn(),
    onSubmit: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CalendarLinkDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Checking: Story = { args: { checkStatus: 'checking' } }

export const Readable: Story = { args: { checkStatus: 'readable' } }

export const Unreadable: Story = {
  args: {
    calendarId: 'staff-3@other.example',
    checkStatus: 'failed',
    errorMessage:
      'このカレンダーを読めません。カレンダーを buddy のサービスアカウントに共有したかと、カレンダーの ID が合っているかを確かめてください。',
  },
}

export const Submitting: Story = { args: { checkStatus: 'readable', isSubmitting: true } }
