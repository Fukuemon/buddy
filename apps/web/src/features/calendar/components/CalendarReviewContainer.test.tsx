import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarReviewContainer.stories'

const { Default, Empty, LoadError } = composeStories(stories)

/**
 * 一覧の行を押し、予定の確認のダイアログを開く。
 * ブラウザでは行のどこを押しても行のボタンに当たるが、jsdom は描画しないので、行のボタンを押す。
 */
const openRow = async (rowTestId: string) => {
  const row = await screen.findByTestId(rowTestId)
  await userEvent.click(within(row).getByRole('button'))
  return screen.getByTestId('calendar-review-dialog')
}

describe('CalendarReviewContainer', () => {
  it('食い違った予定を、日時、職員、理由で並べ、タイトルと利用者名と行ごとのボタンを出さない', async () => {
    render(<Default />)
    const row = await screen.findByTestId('calendar-review-row-schedule-schedule-1')
    expect(within(row).getByTestId('calendar-review-datetime-export-1')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29',
    )
    expect(row).toHaveTextContent('青木 一郎')
    expect(within(row).getByTestId('calendar-review-reason-export-1')).toHaveTextContent(
      'buddy と Google カレンダーの両方で予定が変わりました。',
    )
    expect(within(row).queryByTestId('calendar-review-rewrite-export-1')).toBeNull()
    expect(screen.getByTestId('calendar-review-table')).not.toHaveTextContent('加藤 春子')
    const recurring = screen.getByTestId('calendar-review-row-recurring-recurring-1')
    expect(within(recurring).getByTestId('calendar-review-datetime-export-3')).toHaveTextContent(
      '2026/11/03（火）から毎回 10:00〜11:00',
    )
  })

  it('行を押すと、予定と理由と、その予定で選べる操作をダイアログに出す', async () => {
    render(<Default />)
    const dialog = await openRow('calendar-review-row-schedule-schedule-1')
    expect(within(dialog).getByTestId('calendar-review-dialog-datetime')).toHaveTextContent(
      '2026/11/04（水）09:00〜09:29',
    )
    expect(within(dialog).getByTestId('calendar-review-open-export-1')).toBeInTheDocument()
    expect(within(dialog).getByTestId('calendar-review-rewrite-export-1')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByTestId('calendar-review-close'))
    expect(screen.queryByTestId('calendar-review-dialog')).toBeNull()
  })

  it('buddy でキャンセルした予定は、書き直すと Google カレンダーの予定を消すことを示す', async () => {
    render(<Default />)
    const dialog = await openRow('calendar-review-row-schedule-schedule-4')
    expect(within(dialog).getByTestId('calendar-review-rewrite-export-5')).toBeInTheDocument()
    expect(within(dialog).getByTestId('calendar-review-dialog-reason')).toHaveTextContent(
      'buddy でキャンセルした予定が、Google カレンダーで変わっていました。書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。',
    )
  })

  it('両方で変わった予定にも、buddy の内容で書き直すだけを出し、Google の内容に合わせるを出さない', async () => {
    render(<Default />)
    const dialog = await openRow('calendar-review-row-schedule-schedule-1')
    expect(within(dialog).getByTestId('calendar-review-rewrite-export-1')).toHaveTextContent(
      'buddy の内容で書き直す',
    )
    expect(within(dialog).queryByTestId('calendar-review-accept-export-1')).toBeNull()
    expect(dialog).not.toHaveTextContent('Google の内容に合わせる')
  })

  it('繰り返しの予定には、予定を開くを出さない', async () => {
    render(<Default />)
    const dialog = await openRow('calendar-review-row-recurring-recurring-1')
    expect(within(dialog).queryByTestId('calendar-review-open-export-3')).toBeNull()
  })

  it('確認してから buddy の内容で書き直すと、一覧から消える', async () => {
    render(<Default />)
    const detail = await openRow('calendar-review-row-schedule-schedule-1')
    await userEvent.click(within(detail).getByTestId('calendar-review-rewrite-export-1'))
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
    const detail = await openRow('calendar-review-row-schedule-schedule-4')
    await userEvent.click(within(detail).getByTestId('calendar-review-rewrite-export-5'))
    const dialog = screen.getByTestId('calendar-rewrite-dialog')
    expect(within(dialog).getByTestId('calendar-rewrite-notice')).toHaveTextContent(
      'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。',
    )
    expect(dialog).not.toHaveTextContent('消された予定は作り直します。')
  })

  it('確認のダイアログでキャンセルすると、書き直さずに予定の確認のダイアログに戻る', async () => {
    render(<Default />)
    const detail = await openRow('calendar-review-row-schedule-schedule-5')
    await userEvent.click(within(detail).getByTestId('calendar-review-rewrite-export-2'))
    await userEvent.click(screen.getByTestId('calendar-rewrite-cancel'))
    expect(screen.queryByTestId('calendar-rewrite-dialog')).toBeNull()
    expect(screen.getByTestId('calendar-review-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-review-row-schedule-schedule-5')).toBeInTheDocument()
  })

  it('確認が必要な予定が無ければ、そう示す', async () => {
    render(<Empty />)
    expect(await screen.findByTestId('calendar-review-empty')).toHaveTextContent(
      '確認が必要な予定はありません。',
    )
  })

  it('読めなければ、文と読み直すボタンを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('calendar-review-error')).toHaveTextContent(
      '確認が必要な予定を読み込めませんでした。',
    )
    expect(screen.getByTestId('calendar-review-retry')).toBeInTheDocument()
  })
})
