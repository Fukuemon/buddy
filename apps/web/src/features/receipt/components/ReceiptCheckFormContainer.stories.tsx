import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { ApiError } from '#/api/client'
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

/** 照合の API が入力の CSV のエラーを返す。実績の CSV を選んで照合し、行ごとのエラーを出す。 */
export const RowErrors: Story = {
  parameters: route({
    receiptApi: {
      check: async () => {
        throw new ApiError(422, 'CSV に誤りがあります', [
          { source: 'visits', line: 3, column: '訪問日', message: '日付を読めません' },
        ])
      },
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const file = new File(['訪問日'], 'visits.csv', { type: 'text/csv' })
    await userEvent.upload(await canvas.findByTestId('receipt-visits-file'), file)
    await userEvent.click(canvas.getByTestId('receipt-check-submit'))
    await canvas.findByTestId('receipt-check-error')
  },
}
