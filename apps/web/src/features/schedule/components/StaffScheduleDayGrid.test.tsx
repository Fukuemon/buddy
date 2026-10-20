import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffScheduleDayGrid.stories'

const { Default } = composeStories(stories)

describe('StaffScheduleDayGrid', () => {
  it('職員ごとの列に予定を置き、押すと予定の ID を渡す', async () => {
    const onEventClick = fn()
    render(<Default onEventClick={onEventClick} />)
    expect(screen.getByText('青木 一郎')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('schedule-event-schedule-2'))
    expect(onEventClick).toHaveBeenCalledWith('schedule-2')
  })

  it('30 分の枠を 44px にし、予定を開始と終了の時刻の位置に置く', () => {
    const event = {
      id: 'e1',
      title: '訪問',
      staffId: 'staff-1',
      start: '2026-10-20T09:00:00+09:00',
      end: '2026-10-20T09:30:00+09:00',
      color: 'red',
    }
    render(<Default events={[event]} />)
    expect(screen.getByTestId('day-grid-slot-staff-1-09:00').style.height).toBe('44px')
    const button = screen.getByTestId('schedule-event-e1')
    expect([button.style.top, button.style.height]).toEqual(['264px', '44px'])
  })

  it('空いた枠を押すと、職員と時刻を渡す', async () => {
    const onSlotClick = fn()
    render(<Default onSlotClick={onSlotClick} />)
    await userEvent.click(screen.getByTestId('day-grid-slot-staff-3-15:30'))
    expect(onSlotClick).toHaveBeenCalledWith('staff-3', '15:30')
  })
})
