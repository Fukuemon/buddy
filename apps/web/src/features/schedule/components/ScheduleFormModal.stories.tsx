import { zodResolver } from '@hookform/resolvers/zod'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useForm } from 'react-hook-form'
import { fn } from 'storybook/test'

import type { ScheduleKind } from '#/api/types'

import { createScheduleFormValues } from '../lib/scheduleFormMapper'
import { scheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { ScheduleFormModal } from './ScheduleFormModal'
import { STORY_DATE, storyPatients, storyStaff } from './storyData'

type SampleProps = {
  kind: ScheduleKind
  /** 作成と編集のどちらの題とボタンで描くか。既定は作成 */
  mode?: 'create' | 'edit'
  submitError?: string
  onSubmit: (values: ScheduleFormValues) => void
  onClose: () => void
  onKindChange?: (kind: ScheduleKind) => void
}

const ScheduleFormModalSample = ({ kind, mode = 'create', ...props }: SampleProps) => {
  const form = useForm<ScheduleFormValues>({
    defaultValues: createScheduleFormValues({ kind, date: STORY_DATE }),
    resolver: zodResolver(scheduleFormSchema),
  })
  return (
    <ScheduleFormModal
      {...props}
      form={form}
      patients={storyPatients}
      staffList={storyStaff}
      submitLabel={mode === 'create' ? '作成' : '保存'}
      submitTestId={mode === 'create' ? 'schedule-create-submit' : 'schedule-edit-submit'}
      title={mode === 'create' ? '予定の作成' : '予定の編集'}
    />
  )
}

const meta = {
  title: '画面/Schedule/ScheduleFormModal',
  component: ScheduleFormModalSample,
  args: { kind: 'visit', onSubmit: fn(), onClose: fn(), onKindChange: fn() },
} satisfies Meta<typeof ScheduleFormModalSample>

export default meta
type Story = StoryObj<typeof meta>

export const Visit: Story = {}

export const Normal: Story = { args: { kind: 'normal' } }

export const WithoutKindTab: Story = { args: { onKindChange: undefined, mode: 'edit' } }

export const SubmitError: Story = { args: { submitError: '予定を作成できませんでした。' } }

export const EditSubmitError: Story = {
  args: { onKindChange: undefined, mode: 'edit', submitError: '予定を更新できませんでした。' },
}
