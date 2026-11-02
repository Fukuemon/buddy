import type { Meta, StoryObj } from '@storybook/react-vite'

import { SiteHeader } from './SiteHeader'

const meta = {
  title: '画面/Common/SiteHeader',
  component: SiteHeader,
} satisfies Meta<typeof SiteHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithActions: Story = { args: { actions: <span>青木 一郎</span> } }
