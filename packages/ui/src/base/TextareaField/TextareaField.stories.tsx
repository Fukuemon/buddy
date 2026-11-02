import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'

import { TextareaField } from './TextareaField'

type Values = { memo: string }

type SampleProps = {
  /** 渡すと、フィールドにこの検証のエラーを出す。 */
  error?: string
  disabled?: boolean
}

/** React Hook Form のフォームに TextareaField を 1 つ置いた見本。 */
const TextareaFieldSample = ({ error, disabled }: SampleProps) => {
  const { control } = useForm<Values>({
    shouldFocusError: false,
    defaultValues: { memo: '' },
    errors: error === undefined ? undefined : { memo: { type: 'validate', message: error } },
  })
  return (
    <div className="max-w-md">
      <TextareaField control={control} disabled={disabled} label="メモ" name="memo" />
    </div>
  )
}

const meta = {
  title: 'コンポーネント/Base/TextareaField',
  component: TextareaFieldSample,
} satisfies Meta<typeof TextareaFieldSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = { args: { error: 'メモは 200 文字以内で入力してください' } }

export const Disabled: Story = { args: { disabled: true } }

export const Hover: Story = { parameters: { pseudo: { hover: true } } }

export const WithErrorHover: Story = { ...WithError, parameters: { pseudo: { hover: true } } }

export const Focus: Story = { parameters: { pseudo: { focusVisible: true } } }

export const WithErrorFocus: Story = {
  ...WithError,
  parameters: { pseudo: { focusVisible: true } },
}

export const DisabledHover: Story = { ...Disabled, parameters: { pseudo: { hover: true } } }
