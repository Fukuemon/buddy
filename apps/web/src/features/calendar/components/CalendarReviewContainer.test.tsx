import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarReviewContainer.stories'

const { Default, Empty, Forbidden, LoadError } = composeStories(stories)

describe('CalendarReviewContainer', () => {
  it('書き出せなかった予定を、日時、職員、理由で並べ、題名と利用者名を出さない', async () => {
    render(<Default />)
    const row = await screen.findByTestId('calendar-review-row-export-1')
    expect(within(row).getByTestId('calendar-review-datetime-export-1')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29',
    )
    expect(row).toHaveTextContent('青木 一郎')
    expect(within(row).getByTestId('calendar-review-reason-export-1')).toHaveTextContent(
      'Google カレンダーで予定が直されたので',
    )
    expect(screen.getByTestId('calendar-review-table')).not.toHaveTextContent('加藤 春子')
    expect(screen.getByTestId('calendar-review-datetime-export-3')).toHaveTextContent(
      '2026/11/03（火）から毎回 10:00〜11:00',
    )
    expect(screen.queryByTestId('calendar-review-open-export-3')).toBeNull()
  })

  it('確かめてから buddy の内容で書き直すと、一覧から消える', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-review-rewrite-export-1'))
    const dialog = screen.getByTestId('calendar-rewrite-dialog')
    expect(within(dialog).getByTestId('calendar-rewrite-target')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29、青木 一郎',
    )
    await userEvent.click(within(dialog).getByTestId('calendar-rewrite-submit'))

    expect(await screen.findByTestId('calendar-review-row-export-2')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-review-row-export-1')).toBeNull()
    expect(screen.queryByTestId('calendar-rewrite-dialog')).toBeNull()
  })

  it('キャンセルすると、書き直さずにダイアログを閉じる', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-review-rewrite-export-2'))
    await userEvent.click(screen.getByTestId('calendar-rewrite-cancel'))
    expect(screen.queryByTestId('calendar-rewrite-dialog')).toBeNull()
    expect(screen.getByTestId('calendar-review-row-export-2')).toBeInTheDocument()
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
