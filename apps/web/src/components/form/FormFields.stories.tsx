import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'
import { fn } from 'storybook/test'

import { DatePicker } from './DatePicker'
import { NumberPicker } from './NumberPicker'
import { SearchBox } from './SearchBox'
import { TextareaField } from './TextareaField'
import { TimePicker } from './TimePicker'

type Values = { date: string; time: string; minutes: number; memo: string }

const FormFieldsSample = ({ onSearch }: { onSearch: (value: string) => void }) => {
  const { control } = useForm<Values>({
    defaultValues: { date: '2026-10-20', time: '09:00', minutes: 30, memo: '' },
  })
  return (
    <div className="flex max-w-md flex-col gap-4 p-4">
      <DatePicker control={control} label="日付" name="date" />
      <TimePicker control={control} label="開始時間" name="time" />
      <NumberPicker control={control} label="提供時間（分）" min={0} name="minutes" />
      <SearchBox onSearch={onSearch} placeholder="職員を検索" />
      <TextareaField control={control} label="メモ" name="memo" />
    </div>
  )
}

const meta = {
  title: 'Form/FormFields',
  component: FormFieldsSample,
  args: { onSearch: fn() },
} satisfies Meta<typeof FormFieldsSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
