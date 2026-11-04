import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleDetailModalContainer.stories'

const {
  Cancelled,
  Forbidden,
  GoogleCalendar,
  GoogleCalendarNeedsReview,
  GoogleCalendarRecurrenceUnsupported,
  NotFound,
  ReadOnly,
  Visit,
} = composeStories(stories)

describe('ScheduleDetailModalContainer', () => {
  it('キャンセルした予定を取って、理由を出し、編集のボタンを出さない', async () => {
    render(<Cancelled />)
    expect(await screen.findByTestId('schedule-detail-cancel')).toHaveTextContent(
      'キャンセルした予定です。理由: 利用者の体調不良',
    )
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
  })

  it('予定を編集できる職員には、編集のボタンを出す', async () => {
    render(<Visit />)
    expect(await screen.findByTestId('schedule-detail-edit')).toBeInTheDocument()
  })

  it('編集の権限の外の予定では、「閉じる」だけを出し、編集のボタンを出さない', async () => {
    render(<ReadOnly />)
    expect(await screen.findByTestId('schedule-detail-close')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
  })

  it('予定が見つからないときと見る権限が無いときは、それぞれの文を出す', async () => {
    const { unmount } = render(<NotFound />)
    expect(await screen.findByRole('alert')).toHaveTextContent('予定が見つかりません。')
    unmount()

    render(<Forbidden />)
    expect(await screen.findByRole('alert')).toHaveTextContent('この予定を見る権限がありません。')
  })

  it('Google カレンダーの予定は、Google カレンダーで変更する案内を出し、編集のボタンを出さない', async () => {
    render(<GoogleCalendar />)
    expect(await screen.findByTestId('schedule-detail-google-calendar')).toHaveTextContent(
      'この予定は Google カレンダーで変更してください。',
    )
    expect(screen.getByTestId('schedule-detail-datetime')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-review-reason')).not.toBeInTheDocument()
  })

  it('確認が必要な Google カレンダーの予定は、理由を出す', async () => {
    render(<GoogleCalendarNeedsReview />)
    expect(await screen.findByTestId('schedule-detail-review-reason')).toHaveTextContent(
      '確認が必要な予定です。タイトルの利用者が見つかりません。',
    )
  })

  it('最初の回が表示の期間の外の、繰り返しの規則を写せない予定も出す', async () => {
    render(<GoogleCalendarRecurrenceUnsupported />)
    expect(await screen.findByTestId('schedule-detail-review-reason')).toHaveTextContent(
      '繰り返しの規則を buddy で表せないため、最初の回だけを表示しています',
    )
  })
})
