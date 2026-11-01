import type { Meta, StoryObj } from '@storybook/react-vite'

import { PageForbiddenMessage } from './PageForbiddenMessage'

const meta = {
  title: '画面/Common/PageForbiddenMessage',
  component: PageForbiddenMessage,
} satisfies Meta<typeof PageForbiddenMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 照合の権限が無い職員が、照合の画面を開いたとき。 */
export const ReceiptCheck: Story = { args: { policyName: '照合' } }
