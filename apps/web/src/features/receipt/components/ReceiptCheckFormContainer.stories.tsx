import type { Meta, StoryObj } from '@storybook/react-vite'

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

/** 照合の API が入力の CSV の誤りを返す。CSV を選んで照合すると、行ごとの誤りが出る。 */
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
}
