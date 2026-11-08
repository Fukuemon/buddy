import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'

import { DatePicker } from './DatePicker'

type Values = { date: string }

type SampleProps = {
  /** 渡すと、フィールドにこの検証のエラーを出す。 */
  error?: string
  disabled?: boolean
  /** true なら、見出しを見せず、枠の高さを 44px にする。 */
  isLabelHidden?: boolean
}

/** React Hook Form のフォームに DatePicker を 1 つ置いた見本。 */
const DatePickerSample = ({ error, disabled, isLabelHidden }: SampleProps) => {
  const { control } = useForm<Values>({
    shouldFocusError: false,
    defaultValues: { date: '2026-10-20' },
    errors: error === undefined ? undefined : { date: { type: 'validate', message: error } },
  })
  return (
    <div className="max-w-md">
      <DatePicker
        control={control}
        disabled={disabled}
        isLabelHidden={isLabelHidden}
        isWide
        label="日付"
        name="date"
      />
    </div>
  )
}

const meta = {
  title: 'コンポーネント/Base/DatePicker',
  component: DatePickerSample,
} satisfies Meta<typeof DatePickerSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = { args: { error: '日付を入力してください' } }

export const Disabled: Story = { args: { disabled: true } }

/** 見出しを欄の外に置くときの形。見出しは読み上げだけに残し、高さを 44px にする。 */
export const LabelHidden: Story = { args: { isLabelHidden: true } }

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const WithErrorHover: Story = { ...WithError, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const WithErrorFocus: Story = {
  ...WithError,
  parameters: { pseudo: { focusVisible: true } },
}

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }
