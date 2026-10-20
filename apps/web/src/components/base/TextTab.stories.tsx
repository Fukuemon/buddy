import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { TextTab } from './TextTab'

const meta = {
  title: 'Base/TextTab',
  component: TextTab<string>,
  args: {
    tabs: [
      { id: 'normal', label: '通常' },
      { id: 'visit', label: '訪問' },
    ],
    activeTabId: 'visit',
    onTabChange: fn(),
  },
} satisfies Meta<typeof TextTab<string>>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const White: Story = { args: { variant: 'white' } }
