import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { ApiError } from '#/api/BuddyApi'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { ReceiptCheckFormContainer } from './ReceiptCheckFormContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/receipt/', url: '/receipt/', ...appRouter },
})

const meta = {
  title: '画面/Receipt/ReceiptCheckFormContainer',
  component: ReceiptCheckFormContainer,
  decorators: [withAppRouter],
  parameters: route({}),
} satisfies Meta<typeof ReceiptCheckFormContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 照合の API が入力の CSV の誤りを返す。実績の CSV を選んで照合し、誤りごとの文を出す。 */
export const RowErrors: Story = {
  parameters: route({
    receiptApi: {
      check: async () => {
        throw new ApiError(422, '実績の CSV に誤りがある', [
          {
            source: 'visits',
            reason: 'invalid_date',
            line: 3,
            column: '訪問日',
            message: '暦にない日付: 2024-13-01',
          },
        ])
      },
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const file = new File(['訪問日'], 'visits.csv', { type: 'text/csv' })
    await userEvent.upload(await canvas.findByTestId('receipt-visits-file'), file)
    await userEvent.click(canvas.getByTestId('receipt-check-submit'))
    const alert = await canvas.findByTestId('receipt-check-error')
    await expect(alert).toHaveTextContent(
      '実績の CSV の 3 行目の「訪問日」を日付として読めません。',
    )
  },
}
