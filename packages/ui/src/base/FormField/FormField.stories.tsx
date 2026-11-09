import type { Meta, StoryObj } from '@storybook/react-vite'

import { Select } from '../Select/Select'
import { FormField, formFieldControlClassName } from './FormField'

const meta = {
  title: 'コンポーネント/Base/FormField',
  component: FormField,
  args: {
    label: '名前',
    children: (field) => (
      <input {...field} className={formFieldControlClassName} data-testid="form-field-input" />
    ),
  },
  render: (args) => (
    <div className="w-80">
      <FormField {...args} />
    </div>
  ),
} satisfies Meta<typeof FormField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithHint: Story = {
  args: {
    label: '担当の職員',
    hint: '休職と退職の職員は選べません。',
    children: (field) => (
      <Select {...field} data-testid="form-field-input">
        <option value="">選んでください</option>
        <option value="staff-1">青木 一郎</option>
      </Select>
    ),
  },
}

export const Invalid: Story = {
  args: { error: '名前を入れてください', errorTestId: 'form-field-error' },
}

export const WithHintAndError: Story = {
  args: {
    label: 'メールアドレス',
    hint: 'ログインに使うメールアドレスです。',
    error: 'メールアドレスの形で入れてください',
    errorTestId: 'form-field-error',
  },
}

export const Disabled: Story = {
  args: {
    children: (field) => (
      <input
        {...field}
        className={formFieldControlClassName}
        data-testid="form-field-input"
        defaultValue="青木 一郎"
        disabled
      />
    ),
  },
}

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const InvalidHover: Story = { ...Invalid, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const InvalidFocus: Story = { ...Invalid, parameters: { pseudo: { focusVisible: true } } }

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }

export const Group: Story = {
  args: {
    label: '希望の時間帯',
    isGroup: true,
    error: '希望の時間帯を選んでください',
    errorTestId: 'form-field-error',
    children: (field) => (
      <div {...field} className="flex gap-2" data-testid="form-field-group" role="radiogroup">
        {['午前', '午後'].map((value) => (
          <label
            className="flex min-h-11 items-center gap-2 rounded-8 px-3 ring-1 ring-border-field ring-inset has-[:focus-visible]:focus-ring"
            key={value}
          >
            <input name="time" type="radio" value={value} />
            {value}
          </label>
        ))}
      </div>
    ),
  },
}
