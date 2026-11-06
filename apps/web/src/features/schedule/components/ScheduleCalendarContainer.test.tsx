import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleCalendarContainer.stories'

const { Day, DaySelfEditOnly, GooglePrimaryCutoverDay, GooglePrimaryDay } = composeStories(stories)

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

  it('buddy_primary の事業所では、Google カレンダーの案内と同期の通知を出さない', async () => {
    render(<Day />)
    expect(await screen.findByTestId('day-grid-slot-staff-1-09:00')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-create-open')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-calendar-google-primary')).not.toBeInTheDocument()
  })

  it('google_primary の事業所でも予定を作る操作を出し、案内、同期の警告、確認が必要な予定を出す', async () => {
    render(<GooglePrimaryDay />)
    expect(await screen.findByTestId('day-grid-slot-staff-1-09:00')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-create-open')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-calendar-google-primary')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-calendar-sync-warning')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-calendar-needs-review')).toHaveTextContent(
      '確認が必要な予定が 3 件あります',
    )
    expect(screen.getByTestId('schedule-event-gcal-review-1-needs-review')).toBeInTheDocument()
  })

  it('予定の正本を buddy に切り替えている間は、予定を作る操作を出さない', async () => {
    render(<GooglePrimaryCutoverDay />)
    expect(await screen.findByTestId('day-grid-staff-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('day-grid-slot-staff-1-09:00')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-create-open')).not.toBeInTheDocument()
  })
})
