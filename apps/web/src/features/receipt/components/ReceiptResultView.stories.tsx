import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { mockReceiptReport } from '#/mocks/receiptData'

import { ReceiptResultView } from './ReceiptResultView'

const meta = {
  title: '画面/Receipt/ReceiptResultView',
  component: ReceiptResultView,
  args: {
    report: mockReceiptReport,
    sourceLabel: '2024 年 4 月の Google カレンダー',
    onDownload: fn(),
    checkAgainHref: '/receipt',
  },
} satisfies Meta<typeof ReceiptResultView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithoutWarnings: Story = {
  args: { report: { ...mockReceiptReport, warnings: [] }, sourceLabel: '予定の CSV' },
}

export const Empty: Story = {
  args: {
    report: {
      summary: { mismatch: 0, schedule_only: 0, visit_only: 0, match: 0 },
      rows: [],
      warnings: [],
    },
  },
}
