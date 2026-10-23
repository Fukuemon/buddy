import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarImportPreview } from './CalendarImportPreview'
import { storyAllImportedPreview, storyPatients, storyPreview } from './storyData'

const resolved = {
  'event-ambiguous': { action: 'patient', patientId: 'patient-1' },
  'event-missing': { action: 'normal' },
} as const

const meta = {
  title: '画面/Calendar/CalendarImportPreview',
  component: CalendarImportPreview,
  args: {
    preview: storyPreview,
    staffName: '青木 一郎',
    choices: {},
    onChoiceChange: fn(),
    patients: storyPatients,
    isSubmitting: false,
    onSubmit: fn(),
  },
} satisfies Meta<typeof CalendarImportPreview>

export default meta
type Story = StoryObj<typeof meta>

/** 取り込み方を選んでいない。確定して取り込むは押せない。 */
export const Preview: Story = {}

export const Resolved: Story = { args: { choices: resolved } }

export const Submitting: Story = { args: { choices: resolved, isSubmitting: true } }

export const SubmitError: Story = {
  args: {
    choices: resolved,
    errorMessage:
      'プレビューの後に、Google カレンダーの予定か職員の休職が変わりました。もう一度プレビューしてから取り込んでください。予定は 1 件も取り込んでいません。',
  },
}

export const AllImported: Story = { args: { preview: storyAllImportedPreview } }
