import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarReviewContainer.stories'

const { AcceptFailed, Default, Empty, Forbidden, LoadError } = composeStories(stories)

describe('CalendarReviewContainer', () => {
  it('食い違った予定を、日時、職員、理由で並べ、タイトルと利用者名を出さない', async () => {
    render(<Default />)
    const row = await screen.findByTestId('calendar-review-row-schedule-schedule-1')
    expect(within(row).getByTestId('calendar-review-datetime-export-1')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29',
    )
    expect(row).toHaveTextContent('青木 一郎')
    expect(within(row).getByTestId('calendar-review-reason-export-1')).toHaveTextContent(
      'buddy と Google カレンダーの両方で予定が変わりました。',
    )
    expect(screen.getByTestId('calendar-review-table')).not.toHaveTextContent('加藤 春子')
    const recurring = screen.getByTestId('calendar-review-row-recurring-recurring-1')
    expect(within(recurring).getByTestId('calendar-review-datetime-export-3')).toHaveTextContent(
      '2026/11/03（火）から毎回 10:00〜11:00',
    )
    expect(within(recurring).queryByTestId('calendar-review-open-export-3')).toBeNull()
  })

  it('Google の内容に合わせるは、合わせられる予定にだけ出す', async () => {
    render(<Default />)
    expect(await screen.findByTestId('calendar-review-accept-export-1')).toBeInTheDocument()
    for (const id of ['export-2', 'export-3', 'export-4', 'export-5']) {
      expect(screen.queryByTestId(`calendar-review-accept-${id}`)).toBeNull()
      expect(screen.getByTestId(`calendar-review-rewrite-${id}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('calendar-review-reason-export-4')).toHaveTextContent(
      'buddy の予定に読み替えられません',
    )
    expect(screen.getByTestId('calendar-review-reason-export-5')).toHaveTextContent(
      'buddy でキャンセルした予定が、Google カレンダーで変わっていました。',
    )
  })

  it('確かめてから Google の内容に合わせると、一覧から消える', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-review-accept-export-1'))
    const dialog = screen.getByTestId('calendar-accept-dialog')
    expect(within(dialog).getByTestId('calendar-accept-target')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29、青木 一郎',
    )
    expect(dialog).toHaveTextContent('buddy で変えたタイトルと日時は消えます。')
    await userEvent.click(within(dialog).getByTestId('calendar-accept-submit'))

    expect(await screen.findByTestId('calendar-review-row-schedule-schedule-5')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-review-row-schedule-schedule-1')).toBeNull()
    expect(screen.queryByTestId('calendar-accept-dialog')).toBeNull()
  })

  it('確かめてから buddy の内容で書き直すと、一覧から消える', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-review-rewrite-export-1'))
    const dialog = screen.getByTestId('calendar-rewrite-dialog')
    expect(within(dialog).getByTestId('calendar-rewrite-target')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29、青木 一郎',
    )
    await userEvent.click(within(dialog).getByTestId('calendar-rewrite-submit'))

    expect(await screen.findByTestId('calendar-review-row-schedule-schedule-5')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-review-row-schedule-schedule-1')).toBeNull()
    expect(screen.queryByTestId('calendar-rewrite-dialog')).toBeNull()
  })

  it('キャンセルした単発の予定を書き直すときは、Google カレンダーの予定を消すことを示す', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-review-rewrite-export-5'))
    const dialog = screen.getByTestId('calendar-rewrite-dialog')
    expect(within(dialog).getByTestId('calendar-rewrite-notice')).toHaveTextContent(
      'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。',
    )
    expect(dialog).not.toHaveTextContent('消された予定は作り直します。')
  })

  it('キャンセルすると、書き直さずにダイアログを閉じる', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-review-rewrite-export-2'))
    await userEvent.click(screen.getByTestId('calendar-rewrite-cancel'))
    expect(screen.queryByTestId('calendar-rewrite-dialog')).toBeNull()
    expect(screen.getByTestId('calendar-review-row-schedule-schedule-5')).toBeInTheDocument()
  })

  it('Google の内容に合わせられなければ、ダイアログを開いたまま理由を出す', async () => {
    render(<AcceptFailed />)
    await userEvent.click(await screen.findByTestId('calendar-review-accept-export-1'))
    await userEvent.click(screen.getByTestId('calendar-accept-submit'))
    expect(await screen.findByTestId('calendar-accept-error')).toHaveTextContent(
      'Google カレンダーの予定を、buddy の予定に読み替えられません。',
    )
    expect(screen.getByTestId('calendar-accept-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-accept-submit')).toBeEnabled()
  })

  it('確かめが要る予定が無ければ、そう示す', async () => {
    render(<Empty />)
    expect(await screen.findByTestId('calendar-review-empty')).toHaveTextContent(
      '確かめが要る予定はありません。',
    )
  })

  it('読めなければ、文と読み直すボタンを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('calendar-review-error')).toHaveTextContent(
      '確かめが要る予定を読み込めませんでした。',
    )
    expect(screen.getByTestId('calendar-review-retry')).toBeInTheDocument()
  })

  it('職員の管理の権限が無ければ、一覧を出さない', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-review-table')).toBeNull()
  })
})
