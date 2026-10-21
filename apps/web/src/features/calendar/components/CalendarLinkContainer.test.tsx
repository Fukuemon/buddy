import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarLinkContainer.stories'

const { Default, Forbidden, LoadError, NotConfigured } = composeStories(stories)

const openLinkDialog = async (staffId: string) => {
  await userEvent.click(await screen.findByTestId(`calendar-link-open-${staffId}`))
  return screen.getByTestId('calendar-link-dialog')
}

describe('CalendarLinkContainer', () => {
  it('職員のメールアドレスを入れて開き、読めると確かめてから結び付ける', async () => {
    render(<Default />)
    const dialog = await openLinkDialog('staff-3')
    expect(within(dialog).getByTestId('calendar-link-staff')).toHaveTextContent('上田 三奈')
    expect(within(dialog).getByTestId('calendar-link-input')).toHaveValue('staff-3@example.com')
    expect(within(dialog).getByTestId('calendar-link-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    await userEvent.click(within(dialog).getByTestId('calendar-link-check'))
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      '読めました。結び付けると、予定の取り込みでこのカレンダーを選べます。',
    )
    await userEvent.click(within(dialog).getByTestId('calendar-link-submit'))

    expect(await screen.findByTestId('calendar-link-calendar-id-staff-3')).toHaveTextContent(
      'staff-3@example.com',
    )
    expect(screen.queryByTestId('calendar-link-dialog')).toBeNull()
  })

  it('読めないカレンダーは、理由を警告で出し、結び付けを押せない', async () => {
    render(<Default />)
    const dialog = await openLinkDialog('staff-3')
    const input = within(dialog).getByTestId('calendar-link-input')
    await userEvent.clear(input)
    await userEvent.type(input, '  staff-3@other.test ')
    await userEvent.click(within(dialog).getByTestId('calendar-link-check'))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'このカレンダーを読めません。カレンダーを buddy のサービスアカウントに共有したかと、カレンダーの ID が合っているかを確かめてください。',
    )
    expect(within(dialog).getByTestId('calendar-link-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('確かめた後に入力を変えると、結果を消して結び付けを押せなくする', async () => {
    render(<Default />)
    const dialog = await openLinkDialog('staff-3')
    await userEvent.click(within(dialog).getByTestId('calendar-link-check'))
    await within(dialog).findByTestId('calendar-link-check-result')

    await userEvent.type(within(dialog).getByTestId('calendar-link-input'), 'x')
    expect(within(dialog).queryByTestId('calendar-link-check-result')).toBeNull()
    expect(within(dialog).getByTestId('calendar-link-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('ほかの職員に結び付いたカレンダーは、結び付けの失敗の理由を出し、入力を残す', async () => {
    render(<Default />)
    const dialog = await openLinkDialog('staff-3')
    const input = within(dialog).getByTestId('calendar-link-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'staff-1@example.com')
    await userEvent.click(within(dialog).getByTestId('calendar-link-check'))
    await within(dialog).findByRole('status')
    await userEvent.click(within(dialog).getByTestId('calendar-link-submit'))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'このカレンダーは、ほかの職員に結び付いています。',
    )
    expect(input).toHaveValue('staff-1@example.com')
  })

  it('外すダイアログで外すと、その職員の行を結び付けていないにする', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('calendar-link-remove-staff-1'))
    const dialog = screen.getByTestId('calendar-unlink-dialog')
    expect(dialog).toHaveTextContent(
      '青木 一郎 の Google カレンダー（staff-1@example.com）を外します。取り込んだ予定は buddy に残ります。',
    )
    await userEvent.click(within(dialog).getByTestId('calendar-unlink-submit'))

    expect(await screen.findByTestId('calendar-link-calendar-id-staff-1')).toHaveTextContent(
      '結び付けていません',
    )
  })

  it('キャンセルで、ダイアログを閉じる', async () => {
    render(<Default />)
    const dialog = await openLinkDialog('staff-3')
    await userEvent.click(within(dialog).getByTestId('calendar-link-cancel'))
    expect(screen.queryByTestId('calendar-link-dialog')).toBeNull()
  })

  it('サービスアカウントが無ければ、知らせを出し、結び付けるを押せない', async () => {
    render(<NotConfigured />)
    expect(await screen.findByTestId('calendar-link-not-configured')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-link-guide')).toBeNull()
    expect(screen.getByTestId('calendar-link-open-staff-3')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByTestId('calendar-link-remove-staff-1')).not.toHaveAttribute('aria-disabled')
  })

  it('一覧を読めなければ、失敗の文と読み直すを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('calendar-link-error')).toHaveTextContent(
      '職員とカレンダーを読み込めませんでした。時間をおいて、読み直してください。',
    )
    expect(screen.getByTestId('calendar-link-retry')).toBeInTheDocument()
  })

  it('職員の管理の権限が無ければ、API を呼ばずに権限が無いことを示す', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toHaveTextContent(
      'この画面を開く権限がありません',
    )
    expect(screen.getByTestId('page-forbidden-back')).toHaveAttribute('href', '/schedule')
    expect(screen.queryByTestId('calendar-link-error')).toBeNull()
    expect(screen.queryByTestId('calendar-link-loading')).toBeNull()
  })
})
