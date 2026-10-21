import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { IMPORT_LOAD_ERROR_MESSAGE } from '../lib/errorMessage'
import * as formStories from './CalendarImportForm.stories'
import { CalendarImportForm } from './CalendarImportForm'
import { CalendarImportView } from './CalendarImportView'

const meta = {
  title: '画面/Calendar/CalendarImportView',
  component: CalendarImportView,
  args: { state: { status: 'loading' }, onRetry: fn() },
} satisfies Meta<typeof CalendarImportView>

export default meta
type Story = StoryObj<typeof meta>

/** 結び付けたカレンダーと職員を読み終え、職員と期間の入力を出した。 */
export const Ready: Story = {
  args: {
    state: { status: 'ready' },
    children: <CalendarImportForm {...formStories.default.args} />,
  },
}

export const Loading: Story = {}

export const LoadError: Story = {
  args: { state: { status: 'error', message: IMPORT_LOAD_ERROR_MESSAGE } },
}

export const NoCalendar: Story = { args: { state: { status: 'no-calendar' } } }
