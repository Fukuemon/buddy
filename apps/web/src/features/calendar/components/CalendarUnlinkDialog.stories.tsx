import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarUnlinkDialog } from './CalendarUnlinkDialog'

const meta = {
  title: '画面/Calendar/CalendarUnlinkDialog',
  component: CalendarUnlinkDialog,
  args: {
    staffName: '青木 一郎',
    calendarId: 'staff-1@example.com',
    isSubmitting: false,
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CalendarUnlinkDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Submitting: Story = { args: { isSubmitting: true } }

export const Failed: Story = {
  args: { errorMessage: '外せませんでした。時間をおいて、もう一度外してください。' },
}
