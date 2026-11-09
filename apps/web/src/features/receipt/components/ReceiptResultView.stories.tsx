import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import type { ReceiptRow } from '#/api/types'
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

const [mismatchRow, , , matchRow] = mockReceiptReport.rows

/** 予定と実績が全て合い、注意も無い整合の行。「確認が要る行」の表示では出ない。 */
const cleanMatchRow: ReceiptRow = {
  ...matchRow,
  client: '佐藤 秋子',
  schedule: { ...matchRow.schedule!, end: '13:50', duration: 50 },
  checks: { ...matchRow.checks!, duration_equal: true, end_equal: true },
}

/** 確認が要る行と、注意の無い整合の行が混ざる結果。「全ての行」に切り替えると、整合の行が足される。 */
export const WithCleanMatch: Story = {
  args: {
    report: {
      summary: { mismatch: 1, schedule_only: 0, visit_only: 0, match: 1 },
      rows: [mismatchRow, cleanMatchRow],
      warnings: [],
    },
  },
}

/** 全ての行が整合で、注意も無い結果。「確認が要る行」の表示では、表の代わりに知らせを出す。 */
export const NothingToCheck: Story = {
  args: {
    report: {
      summary: { mismatch: 0, schedule_only: 0, visit_only: 0, match: 1 },
      rows: [cleanMatchRow],
      warnings: [],
    },
  },
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
