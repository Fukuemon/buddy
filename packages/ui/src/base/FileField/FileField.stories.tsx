import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { FileField } from './FileField'

const meta = {
  title: 'コンポーネント/Base/FileField',
  component: FileField,
  args: {
    label: '実績の CSV',
    hint: 'CSV のファイル。10 MB まで。',
    accept: '.csv,text/csv',
    onFileChange: fn(),
    'data-testid': 'file-field-input',
  } as const,
  render: (args) => (
    <div className="max-w-md">
      <FileField {...args} />
    </div>
  ),
} satisfies Meta<typeof FileField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = { args: { error: 'CSV のファイルを選んでください' } }

export const Disabled: Story = { args: { disabled: true } }

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const WithErrorHover: Story = { ...WithError, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const WithErrorFocus: Story = {
  ...WithError,
  parameters: { pseudo: { focusVisible: true } },
}

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }
