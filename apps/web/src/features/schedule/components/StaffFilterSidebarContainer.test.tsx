import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffFilterSidebarContainer.stories'

const { WithCalendar, WithSuspendedStaff } = composeStories(stories)

describe('StaffFilterSidebarContainer', () => {
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
})
