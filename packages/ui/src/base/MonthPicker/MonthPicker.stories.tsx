import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { MonthPicker } from './MonthPicker'

const meta = {
  title: 'コンポーネント/Base/MonthPicker',
  component: MonthPicker,
  args: {
    label: '対象の月',
    hint: 'その月の 1 日から月末までを対象にします。',
    defaultValue: '2026-11',
    onChange: fn(),
    'data-testid': 'month-picker-input',
  } as const,
  render: (args) => (
    <div className="max-w-md">
      <MonthPicker {...args} />
    </div>
  ),
} satisfies Meta<typeof MonthPicker>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = { args: { error: '対象の月を選んでください' } }

export const Disabled: Story = { args: { disabled: true } }

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const WithErrorHover: Story = { ...WithError, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const WithErrorFocus: Story = {
  ...WithError,
  parameters: { pseudo: { focusVisible: true } },
}

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }
