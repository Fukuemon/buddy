import { composeStories, composeStory } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { refocusWindow } from '#/test/refocusWindow'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './ScheduleCalendarContainer.stories'

const { Day, DayAsSecondStaff, DaySelfEditOnly, GooglePrimaryCutoverDay, GooglePrimaryDay, Week } =
  composeStories(stories)

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('幅 768px 未満の週の表示では、時刻の格子の代わりに週の一覧を出す', async () => {
    stubViewport(false)
    render(<Week />)
    expect(await screen.findByTestId('schedule-agenda')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-calendar')).not.toBeInTheDocument()
  })

  it('幅 768px 以上の週の表示では、時刻の格子を出す', async () => {
    stubViewport(true)
    render(<Week />)
    expect(await screen.findByTestId('schedule-calendar')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-agenda')).not.toBeInTheDocument()
  })

  it('日の表示では、ログインした職員の列を左端に置く', async () => {
    render(<DayAsSecondStaff />)
    await screen.findByTestId('day-grid-staff-staff-2')
    expect(screen.getAllByTestId(/^day-grid-staff-/)[0]).toHaveAttribute(
      'data-testid',
      'day-grid-staff-staff-2',
    )
  })
})

describe('予定のカレンダーの読み直し', () => {
  it('読み終えた後に読み直して予定を読めなければ、表示を残して失敗の文を出し、読み直すで読めたら消す', async () => {
    stubViewport(true)
    const Story = composeStory(
      {
        ...stories.RefetchError,
        parameters: {
          ...stories.default.parameters,
          appRouter: { ...stories.default.parameters.appRouter, api: stories.refetchFailingApi() },
        },
      },
      stories.default,
    )
    render(<Story />)
    await screen.findByTestId('schedule-calendar')

    refocusWindow()
    expect(await screen.findByTestId('refetch-error')).toHaveTextContent(
      '最新の情報を読み込めませんでした。',
    )
    expect(screen.getByTestId('schedule-calendar')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('refetch-retry'))
    await expect.poll(() => screen.queryByTestId('refetch-error')).toBeNull()
  })
})
