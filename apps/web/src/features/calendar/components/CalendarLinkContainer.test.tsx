import { composeStories, composeStory } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { refocusWindow } from '#/test/refocusWindow'

import * as stories from './CalendarLinkContainer.stories'

const { Default, LoadError, NotConfigured } = composeStories(stories)

const openLinkDialog = async (staffId: string) => {
  await userEvent.click(await screen.findByTestId(`calendar-link-open-${staffId}`))
  return screen.getByTestId('calendar-link-dialog')
}

describe('CalendarLinkContainer', () => {
  it('職員のメールアドレスを入れて開き、読めると確認してから結び付ける', async () => {
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
      'このカレンダーを読めません。カレンダーが、上に出ている buddy のメールアドレスに共有されているかと、カレンダーの ID が合っているかを確認してください。',
    )
    expect(within(dialog).getByTestId('calendar-link-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(dialog).getByTestId('calendar-link-submit')).toHaveAccessibleDescription(
      '「読めるか確認する」で読めることを確認すると、結び付けられます。',
    )
  })

  it('カレンダーの ID を空にすると、確認のボタンの横に押せるようにする条件を出す', async () => {
    render(<Default />)
    const dialog = await openLinkDialog('staff-3')
    await userEvent.clear(within(dialog).getByTestId('calendar-link-input'))

    expect(within(dialog).getByTestId('calendar-link-check')).toHaveAccessibleDescription(
      'カレンダーの ID を入れると確認できます。',
    )
  })

  it('確認した後に入力を変えると、結果を消して結び付けを押せなくする', async () => {
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
    await userEvent.click(await screen.findByTestId('calendar-link-menu-staff-1'))
    expect(screen.getByTestId('calendar-link-import-staff-1')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('calendar-link-remove-staff-1'))
    const dialog = screen.getByTestId('calendar-unlink-dialog')
    expect(dialog).toHaveTextContent(
      '青木 一郎 の Google カレンダー（staff-1@example.com）を外します。取り込んだ予定は buddy に残ります。結び付け直しても、同じ予定を二度は取り込みません。',
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

  it('事業所の Google カレンダーの設定が無ければ、知らせを出し、結び付けるを押せない', async () => {
    render(<NotConfigured />)
    expect(await screen.findByTestId('calendar-link-not-configured')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-link-guide')).toBeNull()
    expect(screen.getByTestId('calendar-link-open-staff-3')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(await screen.findByTestId('calendar-link-not-configured')).toHaveTextContent(
      'この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。',
    )
    expect(screen.getByTestId('calendar-link-menu-staff-1')).not.toHaveAttribute('aria-disabled')
  })

  it('一覧を読めなければ、失敗の文と読み直すを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('calendar-link-error')).toHaveTextContent(
      '職員とカレンダーを読み込めませんでした。時間をおいて、読み直してください。',
    )
    expect(screen.getByTestId('calendar-link-retry')).toBeInTheDocument()
  })
})

describe('カレンダーの連携の読み直し', () => {
  it('読み終えた後に読み直して結び付いたカレンダーを読めなければ、表示を残して失敗の文を出し、読み直すで読めたら消す', async () => {
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
    await screen.findByTestId('calendar-link-table')

    refocusWindow()
    expect(await screen.findByTestId('refetch-error')).toHaveTextContent(
      '最新の情報を読み込めませんでした。',
    )
    expect(screen.getByTestId('calendar-link-table')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('refetch-retry'))
    await expect.poll(() => screen.queryByTestId('refetch-error')).toBeNull()
  })
})
