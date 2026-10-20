import type { Meta, StoryObj } from '@storybook/react-vite'

import { Loading } from './Loading'

const meta = {
  title: 'Base/Loading',
  component: Loading,
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithDescription: Story = { args: { description: 'カレンダーを表示中...' } }
