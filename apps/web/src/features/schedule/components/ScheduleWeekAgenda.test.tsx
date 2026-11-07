import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'
import * as stories from './ScheduleWeekAgenda.stories'
import { storyStaff } from './storyData'

const { Default, Empty } = composeStories(stories)

const staff = storyStaff[0]!
const event = (
  id: string,
  start: string,
  end: string,
  extra: Partial<ScheduleCalendarEvent> = {},
) => ({
  id,
  title: `予定 ${id}`,
  staffId: staff.id,
  start,
  end,
  color: 'red',
  isCancelled: false,
  needsReview: false,
  ...extra,
})

describe('ScheduleWeekAgenda', () => {
  it('予定の無い週でも、日曜から土曜の 7 日の見出しを出す', () => {
    render(<Empty />)
    expect(
      within(screen.getByTestId('schedule-agenda'))
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual([
      '10月18日（日）',
      '10月19日（月）',
      '10月20日（火）',
      '10月21日（水）',
      '10月22日（木）',
      '10月23日（金）',
      '10月24日（土）',
    ])
  })

  it('行に時刻、タイトル、職員の名前を出し、押すと予定の ID を渡す', async () => {
    const onEventClick = fn()
    render(
      <Default
        events={[event('e1', '2026-10-20T09:00:00+09:00', '2026-10-20T09:30:00+09:00')]}
        onEventClick={onEventClick}
      />,
    )
    const row = screen.getByTestId('schedule-event-e1')
    expect(row).toHaveTextContent('9:00 - 9:30')
    expect(row).toHaveTextContent('予定 e1')
    expect(row).toHaveTextContent(staff.name)

    await userEvent.click(row)
    expect(onEventClick).toHaveBeenCalledWith('e1')
  })

  it('翌日に終わる予定は「翌」を、前の週に始まる予定は「前日」を時刻に付ける', () => {
    render(
      <Default
        events={[
          event('night', '2026-10-21T22:00:00+09:00', '2026-10-22T01:00:00+09:00'),
          event('carried', '2026-10-17T22:00:00+09:00', '2026-10-18T01:00:00+09:00'),
        ]}
      />,
    )
    expect(screen.getByTestId('schedule-event-night')).toHaveTextContent('22:00 - 翌 1:00')
    expect(screen.getByTestId('schedule-event-carried')).toHaveTextContent('前日 22:00 - 1:00')
  })

  it('日の見出しを押すと、その日を渡す', async () => {
    const onDayClick = fn()
    render(<Empty onDayClick={onDayClick} />)
    await userEvent.click(screen.getByTestId('schedule-agenda-day-2026-10-21'))
    expect(onDayClick).toHaveBeenCalledWith('2026-10-21')
  })

  it('キャンセルした予定は、タイトルに取り消し線の印を付ける', () => {
    render(
      <Default
        events={[
          event('c1', '2026-10-20T09:00:00+09:00', '2026-10-20T09:30:00+09:00', {
            isCancelled: true,
          }),
        ]}
      />,
    )
    expect(screen.getByTestId('schedule-event-c1-cancelled')).toHaveClass('line-through')
    expect(screen.getByTestId('schedule-event-c1')).toHaveTextContent('キャンセル、')
  })
})
