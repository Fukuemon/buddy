import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

import { SegmentedControl } from './SegmentedControl'

const meta = {
  title: 'コンポーネント/Base/SegmentedControl',
  component: SegmentedControl<string>,
  args: {
    label: '予定の種類',
    options: [
      { id: 'normal', label: '通常' },
      { id: 'visit', label: '訪問' },
    ],
    value: 'visit',
    onChange: fn(),
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value)
    return (
      <div className="w-60">
        <SegmentedControl
          {...args}
          onChange={(id) => {
            args.onChange(id)
            setValue(id)
          }}
          value={value}
        />
      </div>
    )
  },
} satisfies Meta<typeof SegmentedControl<string>>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ThreeOptions: Story = {
  args: {
    label: '表示の単位',
    options: [
      { id: 'month', label: '月' },
      { id: 'week', label: '週' },
      { id: 'day', label: '日' },
    ],
    value: 'month',
  },
}

export const White: Story = {
  args: { variant: 'white' },
  decorators: [
    (Story) => (
      <div className="bg-surface-subtle p-4">
        <Story />
      </div>
    ),
  ],
}
