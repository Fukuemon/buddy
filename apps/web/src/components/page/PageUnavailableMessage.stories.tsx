import type { Meta, StoryObj } from '@storybook/react-vite'

import { PageUnavailableMessage } from './PageUnavailableMessage'

const meta = {
  title: '画面/Common/PageUnavailableMessage',
  component: PageUnavailableMessage,
  args: { reloadHref: '/schedule' },
} satisfies Meta<typeof PageUnavailableMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
