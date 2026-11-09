import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { RefetchErrorMessage } from './RefetchErrorMessage'

const meta = {
  title: '画面/Common/RefetchErrorMessage',
  component: RefetchErrorMessage,
  args: { onRetry: fn() },
} satisfies Meta<typeof RefetchErrorMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
