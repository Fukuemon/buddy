import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { mockExportIssues } from '#/mocks/scheduleData'

import { CalendarReviewDialog } from './CalendarReviewDialog'

const meta = {
  title: '画面/Calendar/CalendarReviewDialog',
  component: CalendarReviewDialog,
  // showModal は文書の全体を操作できなくするので、Docs のページでは story ごとに iframe で描く
  parameters: { docs: { story: { inline: false, iframeHeight: 480 } } },
  args: {
    issue: mockExportIssues[0],
    onOpenSchedule: fn(),
    onAccept: fn(),
    onRewrite: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CalendarReviewDialog>

export default meta
type Story = StoryObj<typeof meta>

/** buddy と Google カレンダーの両方で変わった単発の予定。合わせると書き直すの両方を出す。 */
export const Default: Story = {}

/** buddy でキャンセルした単発の予定。Google の内容に合わせるは出さない。 */
export const Cancelled: Story = { args: { issue: mockExportIssues[4] } }

/** 繰り返しの予定。予定を開くは出さない。 */
export const Recurring: Story = { args: { issue: mockExportIssues[2] } }
