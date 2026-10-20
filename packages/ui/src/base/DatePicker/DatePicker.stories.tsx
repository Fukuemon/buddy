import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'

import { DatePicker } from './DatePicker'

type Values = { date: string }

type SampleProps = {
  /** 渡すと、フィールドにこの検証のエラーを出す。 */
  error?: string
  disabled?: boolean
}

/** React Hook Form のフォームに DatePicker を 1 つ置いた見本。 */
const DatePickerSample = ({ error, disabled }: SampleProps) => {
  const { control } = useForm<Values>({
    shouldFocusError: false,
    defaultValues: { date: '2026-10-20' },
    errors: error === undefined ? undefined : { date: { type: 'validate', message: error } },
  })
  return (
    <div className="max-w-md">
      <DatePicker control={control} disabled={disabled} isWide label="日付" name="date" />
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
