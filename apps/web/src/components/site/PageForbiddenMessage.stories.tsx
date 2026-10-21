import type { Meta, StoryObj } from '@storybook/react-vite'

import { PageForbiddenMessage } from './PageForbiddenMessage'

const meta = {
  title: '画面/Common/PageForbiddenMessage',
  component: PageForbiddenMessage,
} satisfies Meta<typeof PageForbiddenMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
