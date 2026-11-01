import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleCalendarContainer.stories'

const { DaySelfEditOnly } = composeStories(stories)

describe('ScheduleCalendarContainer', () => {
  it('見る権限のある職員の列だけを出し、編集できる職員の列の枠だけを押せる', async () => {
    render(<DaySelfEditOnly />)
    expect(await screen.findByTestId('day-grid-staff-staff-1')).toBeInTheDocument()
    expect(screen.getByTestId('day-grid-staff-staff-2')).toBeInTheDocument()
    expect(screen.queryByTestId('day-grid-staff-staff-3')).not.toBeInTheDocument()

    expect(screen.getByTestId('day-grid-slot-staff-1-09:00')).toBeInTheDocument()
    expect(screen.queryByTestId('day-grid-slot-staff-2-09:00')).not.toBeInTheDocument()
    expect(screen.getByTestId('schedule-create-open')).toBeInTheDocument()
  })
})
