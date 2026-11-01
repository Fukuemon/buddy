import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffScheduleDayGrid.stories'
import { storyStaff } from './storyData'

const { Default, NextDayOfOvernight, WithNow } = composeStories(stories)

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
    expect([button.style.top, button.style.height]).toEqual(['792px', '44px'])
  })

  it('0 時から 24 時の枠を作り、開いたときに 6 時の位置までスクロールする', () => {
    render(<Default />)
    expect(screen.getByTestId('day-grid-slot-staff-1-00:00')).toBeInTheDocument()
    expect(screen.getByTestId('day-grid-slot-staff-1-23:30')).toBeInTheDocument()
    expect(screen.getByTestId('staff-schedule-day-grid').scrollTop).toBe(528)
  })

  it('翌日に終わる予定を、開始の日には 24 時まで、翌日には 0 時から終了の時刻まで描く', () => {
    const { unmount } = render(<Default />)
    const startDay = screen.getByTestId('schedule-event-schedule-7')
    expect([startDay.style.top, startDay.style.height]).toEqual(['1936px', '176px'])
    expect(startDay).toHaveTextContent('22:00-翌 01:00 夜勤')
    unmount()

    render(<NextDayOfOvernight />)
    const nextDay = screen.getByTestId('schedule-event-schedule-7')
    expect([nextDay.style.top, nextDay.style.height]).toEqual(['0px', '88px'])
    expect(nextDay).toHaveTextContent('22:00-翌 01:00 夜勤')
    expect(screen.queryByTestId('schedule-event-schedule-1')).not.toBeInTheDocument()
  })

  it('空いた枠を押すと、職員と時刻を渡す', async () => {
    const onSlotClick = fn()
    render(<Default onSlotClick={onSlotClick} />)
    await userEvent.click(screen.getByTestId('day-grid-slot-staff-3-15:30'))
    expect(onSlotClick).toHaveBeenCalledWith('staff-3', '15:30')
  })

  it('今の時刻を渡すと、職員の列ごとにその時刻の位置に横線を引く', () => {
    render(<WithNow />)
    // 10:15 は 0 時から 10.25 時間で、1 時間 88px の 902px。線の太さ 2px の中心を合わせる
    expect(screen.getByTestId('day-grid-now-staff-1').style.top).toBe('901px')
    expect(screen.getAllByTestId(/^day-grid-now-/)).toHaveLength(storyStaff.length)
  })

  it('今の時刻を渡さないとき、横線を引かない', () => {
    render(<Default />)
    expect(screen.queryByTestId('day-grid-now-staff-1')).not.toBeInTheDocument()
  })

  it('キャンセルした予定は取り消し線で出し、「キャンセル」は読み上げにだけ残す', () => {
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
    expect(button).toHaveAccessibleName(/^キャンセル、/)
    expect(screen.getByText('キャンセル、')).toHaveClass('sr-only')
    expect(screen.getByTestId('schedule-event-e1-cancelled')).toHaveClass('line-through')
    expect(screen.getByTestId('schedule-event-e1-cancelled')).toHaveTextContent('09:00-09:30 訪問')
  })
})
