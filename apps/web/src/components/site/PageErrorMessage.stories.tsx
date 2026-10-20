import type { Meta, StoryObj } from '@storybook/react-vite'

import { PageErrorMessage } from './PageErrorMessage'

const meta = {
  title: '画面/Common/PageErrorMessage',
  component: PageErrorMessage,
  args: { reloadHref: '/schedule' },
} satisfies Meta<typeof PageErrorMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
