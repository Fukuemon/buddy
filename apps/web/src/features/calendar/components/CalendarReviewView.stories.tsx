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
