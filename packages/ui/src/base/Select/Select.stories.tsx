import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { FormField } from '../FormField/FormField'
import { Select } from './Select'

const STAFF = [
  { value: 'aoki', label: '青木 陽菜' },
  { value: 'mori', label: '森 健太' },
  { value: 'long', label: '訪問看護ステーション 本店 リハビリテーション部 第二チーム 林 さくら' },
]

type SampleProps = {
  /** 渡すと、欄の下に誤りの文を出し、欄に aria-invalid を付ける。 */
  error?: string
  disabled?: boolean
  defaultValue?: string
  onChange?: () => void
}

/** FormField の中に Select を 1 つ置いた見本。 */
const SelectSample = ({ error, disabled, defaultValue = 'aoki', onChange }: SampleProps) => (
  <div className="max-w-sm">
    <FormField error={error} label="担当の職員">
      {(field) => (
        <Select
          {...field}
          data-testid="select-input"
          defaultValue={defaultValue}
          disabled={disabled}
          onChange={onChange}
        >
          {STAFF.map((staff) => (
            <option key={staff.value} value={staff.value}>
              {staff.label}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  </div>
)

const meta = {
  title: 'コンポーネント/Base/Select',
  component: SelectSample,
  args: { onChange: fn() },
} satisfies Meta<typeof SelectSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 長い選択肢を選んだとき。文字は矢印の手前で切れ、矢印に重ならない。 */
export const LongOption: Story = { args: { defaultValue: 'long' } }

export const WithError: Story = { args: { error: '担当の職員を選んでください' } }

export const Disabled: Story = { args: { disabled: true } }

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const WithErrorHover: Story = { ...WithError, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const WithErrorFocus: Story = {
  ...WithError,
  parameters: { pseudo: { focusVisible: true } },
}

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }
