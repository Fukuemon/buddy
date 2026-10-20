import type { Meta, StoryObj } from '@storybook/react-vite'

import { ReceiptResultEmpty } from './ReceiptResultEmpty'

const meta = {
  title: '画面/Receipt/ReceiptResultEmpty',
  component: ReceiptResultEmpty,
  args: { checkHref: '/receipt' },
} satisfies Meta<typeof ReceiptResultEmpty>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
