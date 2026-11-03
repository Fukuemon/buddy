import type { Meta, StoryObj } from '@storybook/react-vite'

import { queryKeys } from '#/api/queryKeys'
import { mockReceiptReport } from '#/mocks/receiptData'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import type { ReceiptResult } from '../queries'
import { ReceiptResultContainer } from './ReceiptResultContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/receipt/result', url: '/receipt/result', ...appRouter },
})

const withResult = (result: ReceiptResult) =>
  route({ seed: (queryClient) => queryClient.setQueryData(queryKeys.receiptResult(), result) })

const meta = {
  title: '画面/Receipt/ReceiptResultContainer',
  component: ReceiptResultContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof ReceiptResultContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 結果が cache に無いとき。照合の画面へ案内する。 */
export const NoResult: Story = {}

export const FromCalendar: Story = {
  parameters: withResult({
    report: mockReceiptReport,
    month: '2026-09',
    checkedAt: '2026-10-21T10:00:00+09:00',
  }),
}

export const FromCsv: Story = {
  parameters: withResult({ report: mockReceiptReport, checkedAt: '2026-10-21T10:00:00+09:00' }),
}
