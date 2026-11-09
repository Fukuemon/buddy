import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

import { ChipPicker } from './ChipPicker'

const meta = {
  title: 'コンポーネント/Base/ChipPicker',
  component: ChipPicker,
  args: {
    label: '対象の職員',
    addLabel: '＋ 職員を選ぶ',
    addAriaLabel: '対象の職員を選ぶ',
    emptyLabel: '選べる職員がいません',
    options: [
      { id: 's1', name: '青木 一郎' },
      { id: 's2', name: '石川 花子' },
      { id: 's3', name: '上田 次郎' },
    ],
    selectedIds: ['s1'],
    onChange: fn(),
    testIdPrefix: 'staff-picker',
  },
  render: function Render(args) {
    const [selectedIds, setSelectedIds] = useState(args.selectedIds)
    return (
      <ChipPicker
        {...args}
        onChange={(next) => {
          args.onChange(next)
          setSelectedIds(next)
        }}
        selectedIds={selectedIds}
      />
    )
  },
} satisfies Meta<typeof ChipPicker>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { selectedIds: [] } }

export const AllSelected: Story = { args: { selectedIds: ['s1', 's2', 's3'] } }

export const Disabled: Story = { args: { disabled: true } }
