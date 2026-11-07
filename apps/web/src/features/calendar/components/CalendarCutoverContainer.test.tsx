import { composeStories, composeStory } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { refocusWindow } from '#/test/refocusWindow'

import * as stories from './CalendarCutoverContainer.stories'

const { BuddyPrimary, NotStarted, Open, SyncNotReady } = composeStories(stories)

describe('CalendarCutoverContainer', () => {
  it('始める前は、手順、Google カレンダーを変えない案内、カレンダーごとの同期を出し、始めると切り替え中にする', async () => {
    render(<NotStarted />)
    expect(await screen.findByTestId('calendar-cutover-no-edit')).toHaveTextContent(
      '切り替えが終わるまで Google カレンダーで予定を作成、変更しないよう頼んでください',
    )
    expect(screen.getByTestId('calendar-cutover-calendar-staff-2')).toHaveTextContent('石川 二葉')
    await userEvent.click(screen.getByTestId('calendar-cutover-start'))
    expect(await screen.findByTestId('calendar-cutover-open')).toHaveTextContent(
      '取り込みの期間: 2026/11/01〜',
    )
    expect(screen.getByTestId('calendar-cutover-import-staff-1')).toHaveTextContent(
      'まだ取り込んでいない',
    )
    expect(screen.getByTestId('calendar-cutover-open-import-staff-1')).toHaveAttribute(
      'href',
      '/schedule/import?staff=staff-1',
    )
  })

  it('最後の同期が成功していないカレンダーがあると、始められない理由に職員の名前を出す', async () => {
    render(<SyncNotReady />)
    await userEvent.click(await screen.findByTestId('calendar-cutover-start'))
    expect(await screen.findByTestId('calendar-cutover-start-error')).toHaveTextContent('石川 二葉')
  })

  it('取り込んでいないカレンダーがあると、完了せずに満たさない一覧を出す', async () => {
    render(<Open />)
    await userEvent.click(await screen.findByTestId('calendar-cutover-complete'))
    const unmet = await screen.findByTestId('calendar-cutover-unmet')
    expect(unmet).toHaveTextContent('完了できません（2 件）')
    const rows = within(unmet).getAllByTestId('calendar-cutover-unmet-not_imported')
    expect(rows[0]).toHaveTextContent('青木 一郎')
    expect(rows[0]).toHaveTextContent('この切り替えで、まだ取り込んでいない')
    expect(screen.getByTestId('calendar-cutover-open')).toBeInTheDocument()
  })

  it('やめると、確認のダイアログで確定してから、始める前の状態に戻す', async () => {
    render(<Open />)
    await userEvent.click(await screen.findByTestId('calendar-cutover-cancel'))
    const dialog = await screen.findByTestId('calendar-cutover-cancel-confirm-dialog')
    expect(dialog).toHaveTextContent('この切り替えで取り込んだ予定を、buddy から消します')
    await userEvent.click(within(dialog).getByTestId('calendar-cutover-cancel-confirm-submit'))
    expect(await screen.findByTestId('calendar-cutover-start')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-cutover-cancel-confirm-dialog')).toBeNull()
  })

  it('予定の正本が buddy の事業所では、操作を出さない', async () => {
    render(<BuddyPrimary />)
    expect(await screen.findByTestId('calendar-cutover-buddy-primary')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-cutover-start')).toBeNull()
  })
})

describe('予定の正本の切り替えの読み直し', () => {
  it('読み終えた後に読み直して切り替えの状況を読めなければ、表示を残して失敗の文を出し、読み直すで読めたら消す', async () => {
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
    await screen.findByTestId('calendar-cutover-calendars')

    refocusWindow()
    expect(await screen.findByTestId('refetch-error')).toHaveTextContent(
      '最新の情報を読み込めませんでした。',
    )
    expect(screen.getByTestId('calendar-cutover-calendars')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('refetch-retry'))
    await expect.poll(() => screen.queryByTestId('refetch-error')).toBeNull()
  })
})
