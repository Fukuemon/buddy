import type { Meta, StoryObj } from '@storybook/react-vite'
import { createModalDocsParameters } from '@buddy/ui/storybook-preview'
import { fn } from 'storybook/test'

import { mockExportIssues } from '#/mocks/scheduleData'

import { CalendarReviewDialog } from './CalendarReviewDialog'

const meta = {
  title: '画面/Calendar/CalendarReviewDialog',
  component: CalendarReviewDialog,
  parameters: createModalDocsParameters(),
  args: {
    issue: mockExportIssues[0],
    onOpenSchedule: fn(),
    onRewrite: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CalendarReviewDialog>

export default meta
type Story = StoryObj<typeof meta>

/** buddy と Google カレンダーの両方で変わった単発の予定。 */
export const Default: Story = {}

/** buddy でキャンセルした単発の予定。書き直すと Google カレンダーの予定を消すことを示す。 */
export const Cancelled: Story = { args: { issue: mockExportIssues[4] } }

/** 繰り返しの予定。予定を開くは出さない。 */
export const Recurring: Story = { args: { issue: mockExportIssues[2] } }
