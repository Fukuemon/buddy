import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'

import type { AppRouterParameters } from '#/storybook/withAppRouter'

import * as stories from './ScheduleDetailModalContainer.stories'

const {
  Cancelled,
  Forbidden,
  GoogleCalendar,
  GoogleCalendarCutover,
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

  it('Google カレンダーの予定は、「Google カレンダー」の印と、書き込みの説明を入れた ? と、編集とキャンセルのボタンを出す', async () => {
    render(<GoogleCalendar />)
    expect((await screen.findByTestId('schedule-detail-google-calendar')).textContent).toBe(
      'Google カレンダー',
    )
    const helpText = screen.getByTestId('schedule-detail-google-calendar-help-text')
    expect(helpText).not.toBeVisible()
    await userEvent.click(screen.getByTestId('schedule-detail-google-calendar-help'))
    expect(helpText).toBeVisible()
    expect(helpText).toHaveTextContent(
      'buddy で変更かキャンセルすると、Google カレンダーにも書きます。',
    )
    expect(screen.getByTestId('schedule-detail-datetime')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-detail-edit')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-detail-cancel-schedule')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-review-reason')).not.toBeInTheDocument()
  })

  it('予定の正本を切り替えている間は、編集とキャンセルのボタンを出さない', async () => {
    render(<GoogleCalendarCutover />)
    expect(await screen.findByTestId('schedule-detail-close')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-cancel-schedule')).not.toBeInTheDocument()
  })

  it('確認が必要な Google カレンダーの予定は、理由を出す', async () => {
    render(<GoogleCalendarNeedsReview />)
    expect(await screen.findByTestId('schedule-detail-review-reason')).toHaveTextContent(
      '確認が必要な予定です。タイトルの利用者が見つかりません。',
    )
  })

  it('最初の回が表示の期間の外の、繰り返しの規則を写せない予定も出し、編集とキャンセルのボタンを出さない', async () => {
    render(<GoogleCalendarRecurrenceUnsupported />)
    expect(await screen.findByTestId('schedule-detail-review-reason')).toHaveTextContent(
      '繰り返しの規則を buddy で表せないため、最初の回だけを表示しています。Google カレンダーで繰り返しの規則を直してください。',
    )
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-cancel-schedule')).not.toBeInTheDocument()
  })

  it('キャンセルの確認のダイアログは、閉じる側を「戻る」にし、押すと予定をキャンセルせずに詳細に戻る', async () => {
    render(<Visit />)
    await userEvent.click(await screen.findByTestId('schedule-detail-cancel-schedule'))
    expect(screen.getByTestId('schedule-cancel-cancel').textContent).toBe('戻る')
    expect(screen.getByTestId('schedule-cancel-submit')).toHaveTextContent('予定をキャンセルする')

    await userEvent.click(screen.getByTestId('schedule-cancel-cancel'))
    expect(screen.queryByTestId('schedule-cancel-dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('schedule-detail-cancel-schedule')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-cancel')).not.toBeInTheDocument()
  })

  it('予定をキャンセルすると、理由と詳細を開いたときの etag を送り、Google カレンダーの予定は理由を残さないことを示す', async () => {
    const { api } = GoogleCalendar.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    // story の間で共有するフェイクの API の予定を消すので、このテストをファイルの最後に置く
    const cancel = vi.spyOn(api.schedules, 'cancel')
    render(<GoogleCalendar />)

    await userEvent.click(await screen.findByTestId('schedule-detail-cancel-schedule'))
    expect(screen.getByTestId('schedule-cancel-description')).toHaveTextContent(
      'Google カレンダーから予定を消します。キャンセルの理由は、Google カレンダーに書けないので残りません。',
    )
    expect(screen.getByTestId('schedule-cancel-submit')).toHaveAttribute('aria-disabled', 'true')
    await userEvent.type(screen.getByTestId('schedule-cancel-reason'), '利用者の都合')
    await userEvent.click(screen.getByTestId('schedule-cancel-submit'))

    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(cancel.mock.calls[0]?.slice(1)).toEqual([
      'gcal-schedule-3',
      '利用者の都合',
      '"etag-schedule-3"',
    ])
  })
})
