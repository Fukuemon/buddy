import type { Meta, StoryObj } from '@storybook/react-vite'

import { fakeReceiptReport } from '#/api/fake/fakeReceiptApi'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { receiptResultKey, type ReceiptResult } from '../queries'
import { ReceiptResultContainer } from './ReceiptResultContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/receipt/result', url: '/receipt/result', ...appRouter },
})

const withResult = (result: ReceiptResult) =>
  route({ seed: (queryClient) => queryClient.setQueryData(receiptResultKey, result) })

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
    report: fakeReceiptReport,
    month: '2026-09',
    checkedAt: '2026-10-21T10:00:00+09:00',
  }),
}

export const FromCsv: Story = {
  parameters: withResult({ report: fakeReceiptReport, checkedAt: '2026-10-21T10:00:00+09:00' }),
}
