import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { fakeStaff } from '#/api/fake/fixtures'

import { CalendarImportForm } from './CalendarImportForm'

const meta = {
  title: '画面/Calendar/CalendarImportForm',
  component: CalendarImportForm,
  args: {
    staffOptions: fakeStaff.slice(0, 2),
    staffId: 'staff-1',
    onStaffChange: fn(),
    start: '2026-11-01',
    onStartChange: fn(),
    end: '2026-11-30',
    onEndChange: fn(),
    rangeErrors: {},
    canPreview: true,
    isLocked: false,
    isPreviewing: false,
    onPreview: fn(),
  },
} satisfies Meta<typeof CalendarImportForm>

export default meta
type Story = StoryObj<typeof meta>

export const Initial: Story = {}

export const Previewing: Story = { args: { isLocked: true, isPreviewing: true } }

export const PreviewError: Story = {
  args: {
    errorMessage:
      'Google カレンダーから予定を読めませんでした。時間をおいて、もう一度プレビューしてください。',
  },
}

export const StartAfterEnd: Story = {
  args: {
    start: '2026-12-01',
    canPreview: false,
    rangeErrors: { start: '開始日は、終了日より前の日にしてください。' },
  },
}

export const TooLong: Story = {
  args: {
    end: '2027-12-31',
    canPreview: false,
    rangeErrors: { end: '期間は 1 年までにしてください。' },
  },
}
