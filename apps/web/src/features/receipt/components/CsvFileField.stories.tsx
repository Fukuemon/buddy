import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CsvFileField } from './CsvFileField'

const meta = {
  title: '画面/Receipt/CsvFileField',
  component: CsvFileField,
  args: { label: '実績の CSV', onChange: fn() },
} satisfies Meta<typeof CsvFileField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithDescription: Story = {
  args: { description: '電子カルテから書き出した CSV。10 MB まで。' },
}
