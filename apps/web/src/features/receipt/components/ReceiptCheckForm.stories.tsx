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

export const Calendar: Story = { args: { submitHint: '対象の月と実績の CSV を選んでください。' } }

export const ScheduleCsv: Story = {
  args: { source: 'csv', submitHint: '予定の CSV と実績の CSV を選んでください。' },
}

export const Ready: Story = { args: { canSubmit: true } }

export const Submitting: Story = { args: { canSubmit: true, isSubmitting: true } }

export const RowErrors: Story = {
  args: {
    canSubmit: true,
    errorMessage: '入力の CSV に誤りがあります。次のところを直して、もう一度照合してください。',
    errorLines: [
      '実績の CSV に「提供時間」の列がありません。電子カルテから書き出し直してください。',
      '予定の CSV の 5 行目の「訪問日」を日付として読めません。',
    ],
  },
}
