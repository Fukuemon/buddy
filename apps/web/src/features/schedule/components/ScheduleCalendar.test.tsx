import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './ScheduleCalendar.stories'

const { Month, Week } = composeStories(stories)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScheduleCalendar', () => {
  it('週の表示で、翌日に終わる予定を開始の日と翌日に描き、どちらを押しても同じ予定の ID を渡す', async () => {
    stubViewport(true)
    const onEventClick = fn()
    render(<Week onEventClick={onEventClick} />)
    const segments = screen.getAllByTestId('schedule-event-schedule-7')
    expect(segments).toHaveLength(2)
    for (const segment of segments) expect(segment).toHaveTextContent('22:00 - 翌 1:00 夜勤')

    await userEvent.click(segments[1])
    expect(onEventClick).toHaveBeenCalledWith('schedule-7')
  })

  it('幅 768px 未満の週の表示では、列の見出しを曜日と日の 2 行にし、768px 以上に広げると「10/18(日)」の書式に戻す', async () => {
    const viewport = stubViewport(false)
    render(<Week />)
    const headerTexts = () =>
      screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headerTexts()).toEqual(['日18', '月19', '火20', '水21', '木22', '金23', '土24'])

    viewport.resize(true)
    await waitFor(() => expect(headerTexts()[0]).toBe('10/18(日)'))
    expect(headerTexts()[6]).toBe('10/24(土)')
  })

  it('幅 768px 未満の月の表示では、列の見出しを曜日のまま出す', () => {
    stubViewport(false)
    render(<Month />)
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '日',
      '月',
      '火',
      '水',
      '木',
      '金',
      '土',
    ])
  })
})
