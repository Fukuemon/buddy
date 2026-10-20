import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { SearchBox } from './SearchBox'

const meta = {
  title: 'コンポーネント/Case/SearchBox',
  component: SearchBox,
  args: { 'aria-label': '職員を検索', placeholder: '職員を検索', onSearch: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchBox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = { args: { defaultValue: '青木' } }
