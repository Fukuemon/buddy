import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { CalendarImportDone } from './CalendarImportDone'
import { storyDecisions, storyPreview, storyResult } from './storyData'

const meta = {
  title: '画面/Calendar/CalendarImportDone',
  component: CalendarImportDone,
  args: {
    result: storyResult,
    preview: storyPreview,
    decisions: storyDecisions,
    onOpenCalendar: fn(),
  },
} satisfies Meta<typeof CalendarImportDone>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
