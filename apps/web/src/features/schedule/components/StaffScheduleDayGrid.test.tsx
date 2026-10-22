import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffScheduleDayGrid.stories'
import { storyStaff } from './storyData'

const { Default, WithNow } = composeStories(stories)

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
      cancelled: false,
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

  it('今の時刻を渡すと、職員の列ごとにその時刻の位置に横線を引く', () => {
    render(<WithNow />)
    // 10:15 は 6 時から 4.25 時間で、1 時間 88px の 374px。線の太さ 2px の中心を合わせる
    expect(screen.getByTestId('day-grid-now-staff-1').style.top).toBe('373px')
    expect(screen.getAllByTestId(/^day-grid-now-/)).toHaveLength(storyStaff.length)
  })

  it.each([
    ['今の時刻を渡さない', undefined],
    ['表示する時刻より前', new Date(2026, 9, 20, 5, 59)],
    ['表示する時刻の後', new Date(2026, 9, 20, 22, 0)],
  ])('%s とき、横線を引かない', (_, now) => {
    render(<Default now={now} />)
    expect(screen.queryByTestId('day-grid-now-staff-1')).not.toBeInTheDocument()
  })

  it('キャンセルした予定は「キャンセル」の印と取り消し線で出す', () => {
    const event = {
      id: 'e1',
      title: '訪問',
      staffId: 'staff-1',
      start: '2026-10-20T09:00:00+09:00',
      end: '2026-10-20T09:30:00+09:00',
      color: 'red',
      cancelled: true,
    }
    render(<Default events={[event]} />)
    const button = screen.getByTestId('schedule-event-e1')
    expect(button).toHaveTextContent('キャンセル')
    expect(button.querySelector('.line-through')).toHaveTextContent('09:00-09:30 訪問')
  })
})
