import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ReceiptCheckForm } from './ReceiptCheckForm'

const meta = {
  title: '画面/Receipt/ReceiptCheckForm',
  component: ReceiptCheckForm,
  args: {
    source: 'calendar',
    onSourceChange: fn(),
    month: '2024-04',
    onMonthChange: fn(),
    onSchedulesChange: fn(),
    onVisitsChange: fn(),
    canSubmit: false,
    isSubmitting: false,
    onSubmit: fn(),
  },
} satisfies Meta<typeof ReceiptCheckForm>

export default meta
type Story = StoryObj<typeof meta>

export const Calendar: Story = {}

export const ScheduleCsv: Story = { args: { source: 'csv' } }

export const Ready: Story = { args: { canSubmit: true } }

export const Submitting: Story = { args: { canSubmit: true, isSubmitting: true } }

export const RowErrors: Story = {
  args: {
    canSubmit: true,
    errorMessage: '入力の CSV に誤りがあります。次の行を直して、もう一度照合してください。',
    rowErrors: [
      { source: 'visits', line: 3, column: '訪問日', message: '暦にない日付: 2024-13-01' },
      { source: 'schedules', line: 5, message: '列の数が見出しと違う' },
    ],
  },
}
