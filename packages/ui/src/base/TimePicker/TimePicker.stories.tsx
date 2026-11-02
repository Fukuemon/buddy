import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'

import { TimePicker } from './TimePicker'

type Values = { time: string }

type SampleProps = {
  /** 渡すと、フィールドにこの検証のエラーを出す。 */
  error?: string
  disabled?: boolean
}

/** React Hook Form のフォームに TimePicker を 1 つ置いた見本。 */
const TimePickerSample = ({ error, disabled }: SampleProps) => {
  const { control } = useForm<Values>({
    shouldFocusError: false,
    defaultValues: { time: '09:00' },
    errors: error === undefined ? undefined : { time: { type: 'validate', message: error } },
  })
  return (
    <div className="max-w-md">
      <TimePicker control={control} disabled={disabled} isWide label="開始時間" name="time" />
    </div>
  )
}

const meta = {
  title: 'コンポーネント/Base/TimePicker',
  component: TimePickerSample,
} satisfies Meta<typeof TimePickerSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = { args: { error: '開始時間を入力してください' } }

export const Disabled: Story = { args: { disabled: true } }

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const WithErrorHover: Story = { ...WithError, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const WithErrorFocus: Story = {
  ...WithError,
  parameters: { pseudo: { focusVisible: true } },
}

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }
