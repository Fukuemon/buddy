import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { mockExportIssues } from '#/mocks/scheduleData'

import { CalendarReviewView } from './CalendarReviewView'

const meta = {
  title: '画面/Calendar/CalendarReviewView',
  component: CalendarReviewView,
  args: {
    state: { status: 'ready', issues: mockExportIssues },
    onRetry: fn(),
    onSelect: fn(),
  },
} satisfies Meta<typeof CalendarReviewView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { state: { status: 'ready', issues: [] } } }

export const Loading: Story = { args: { state: { status: 'loading' } } }

export const LoadError: Story = {
  args: {
    state: {
      status: 'error',
      message: '確認が必要な予定を読み込めませんでした。時間をおいて、読み直してください。',
    },
  },
}

/** 終了が翌日の予定の行。日時の終了の時刻に「翌」が付く。 */
export const OvernightIssue: Story = {
  args: {
    state: {
      status: 'ready',
      issues: [
        {
          ...mockExportIssues[0]!,
          date: '2026-11-13',
          start_time: '22:00',
          end_time: '01:00',
          ends_next_day: true,
        },
      ],
    },
  },
}
