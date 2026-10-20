import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'

import { NumberPicker } from './NumberPicker'

type Values = { minutes: number }

type SampleProps = {
  /** 渡すと、フィールドにこの検証のエラーを出す。 */
  error?: string
  disabled?: boolean
}

/** React Hook Form のフォームに NumberPicker を 1 つ置いた見本。 */
const NumberPickerSample = ({ error, disabled }: SampleProps) => {
  const { control } = useForm<Values>({
    defaultValues: { minutes: 30 },
    errors: error === undefined ? undefined : { minutes: { type: 'validate', message: error } },
  })
  return (
    <div className="max-w-md">
      <NumberPicker
        control={control}
        disabled={disabled}
        isWide
        label="提供時間（分）"
        min={0}
        name="minutes"
      />
    </div>
  )
}

const meta = {
  title: 'コンポーネント/Base/NumberPicker',
  component: NumberPickerSample,
} satisfies Meta<typeof NumberPickerSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = { args: { error: '0 以上の数を入力してください' } }

export const Disabled: Story = { args: { disabled: true } }
