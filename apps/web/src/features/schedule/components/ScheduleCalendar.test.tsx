import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleCalendar.stories'

const { Week } = composeStories(stories)

describe('ScheduleCalendar', () => {
  it('週の表示で、翌日に終わる予定を開始の日と翌日に描き、どちらを押しても同じ予定の ID を渡す', async () => {
    const onEventClick = fn()
    render(<Week onEventClick={onEventClick} />)
    const segments = screen.getAllByTestId('schedule-event-schedule-7')
    expect(segments).toHaveLength(2)
    for (const segment of segments) expect(segment).toHaveTextContent('22:00 - 翌 1:00 夜勤')

    await userEvent.click(segments[1])
    expect(onEventClick).toHaveBeenCalledWith('schedule-7')
  })
})
