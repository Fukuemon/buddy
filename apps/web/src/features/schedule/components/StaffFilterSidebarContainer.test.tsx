import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffFilterSidebarContainer.stories'

const {
  ReadableOnly,
  WithCalendar,
  WithSuspendedStaff,
  WithSuspendedStaffSelected,
  WithSuspendedStaffWeek,
} = composeStories(stories)

describe('StaffFilterSidebarContainer', () => {
  it('予定を見る権限の無い職員と、その職員だけのチームを、絞り込みに出さない', async () => {
    render(<ReadableOnly />)
    expect(await screen.findByTestId('staff-filter-staff-staff-1')).toBeInTheDocument()
    expect(screen.getByTestId('staff-filter-staff-staff-2')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-filter-staff-staff-3')).not.toBeInTheDocument()
    expect(screen.queryByTestId('staff-filter-staff-staff-4')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-filter-team-team-a')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-filter-team-team-b')).not.toBeInTheDocument()
  })

  it('止めた職員を、絞り込みの候補と日の表の列に出さず、その予定も出さない', async () => {
    render(<WithSuspendedStaff />)
    expect(await screen.findByTestId('day-grid-staff-staff-1')).toBeInTheDocument()
    expect(screen.getByTestId('staff-filter-staff-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-filter-staff-staff-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('day-grid-staff-staff-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-event-schedule-2')).not.toBeInTheDocument()
  })

  it('止めた職員がいなければ、全ての職員の列を同じ順に出す', async () => {
    render(<WithCalendar />)
    await screen.findByTestId('day-grid-staff-staff-1')
    const columns = screen.getAllByTestId(/^day-grid-staff-/).map((column) => column.dataset.testid)
    expect(columns).toEqual([
      'day-grid-staff-staff-1',
      'day-grid-staff-staff-2',
      'day-grid-staff-staff-3',
      'day-grid-staff-staff-4',
    ])
  })

  it('URL に止めた職員の ID が残っていても、残りの職員を選び足すと全員の表示に戻さない', async () => {
    render(<WithSuspendedStaffSelected />)
    expect(await screen.findByTestId('day-grid-staff-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('day-grid-staff-staff-3')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('staff-filter-staff-staff-3'))

    expect(await screen.findByTestId('day-grid-staff-staff-3')).toBeInTheDocument()
    expect(screen.getByTestId('staff-filter-staff-staff-4')).not.toBeChecked()
    expect(screen.queryByTestId('day-grid-staff-staff-4')).not.toBeInTheDocument()
  })

  it('週の表示でも、止めた職員の予定を出さない', async () => {
    render(<WithSuspendedStaffWeek />)
    expect(await screen.findByTestId('schedule-event-schedule-1')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-event-schedule-2')).not.toBeInTheDocument()
  })
})
