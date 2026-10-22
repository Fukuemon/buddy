import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleCalendarToolbar.stories'

const { Default, DayView } = composeStories(stories)

describe('ScheduleCalendarToolbar', () => {
  it('表示の期間を、変わると読み上げる画面の見出しで出す', () => {
    render(<Default />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('2026年10月')
    expect(heading).toHaveAttribute('aria-live', 'polite')
  })

  it('日の表示では、日付と曜日を見出しにする', () => {
    render(<DayView />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026年10月20日（火）')
  })

  it('キャンセルした予定を出す切り替えを入れると、true を渡す', async () => {
    const onShowCancelledChange = fn()
    render(<Default onShowCancelledChange={onShowCancelledChange} />)
    await userEvent.click(screen.getByTestId('calendar-show-cancelled'))
    expect(onShowCancelledChange).toHaveBeenCalledWith(true)
  })
})
