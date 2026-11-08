import { composeStories, composeStory } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import type { BuddyApi } from '#/api/BuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
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
    const cancel = await screen.findByTestId('calendar-cutover-cancel')
    expect(cancel).toHaveClass('text-danger')
    await userEvent.click(cancel)
    const dialog = await screen.findByTestId('calendar-cutover-cancel-confirm-dialog')
    expect(dialog).toHaveTextContent('この切り替えで取り込んだ予定を、buddy から消します')
    expect(within(dialog).getByTestId('calendar-cutover-cancel-confirm-cancel')).toHaveTextContent(
      '戻る',
    )
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

/** 切り替え中のフェイクの API を、この画面と、ほかの画面で操作する API として作り、その API で story を描く。 */
const renderWithApi = (story: typeof stories.Open, api: BuddyApi) => {
  const Story = composeStory(
    {
      ...story,
      parameters: {
        ...stories.default.parameters,
        appRouter: { ...stories.default.parameters.appRouter, api },
      },
    },
    stories.default,
  )
  render(<Story />)
}

/** ほかの画面で、全ての職員を取り込んでから切り替えを完了する。確認が必要な予定は取り込まない。 */
const completeElsewhere = async (api: BuddyApi) => {
  const { cutover, calendars } = await api.calendars.cutoverStatus(MOCK_FACILITY_ID)
  if (cutover === null) throw new Error('切り替え中でない')
  const range = { range_start: cutover.range_start }
  for (const calendar of calendars) {
    const preview = await api.calendars.preview(
      MOCK_FACILITY_ID,
      calendar.external_calendar_id,
      range,
    )
    await api.calendars.import(MOCK_FACILITY_ID, calendar.external_calendar_id, {
      ...range,
      decisions: preview.needs_review.map((r) => ({
        external_event_id: r.external_event_id,
        revision: r.revision,
        action: 'skip' as const,
      })),
    })
  }
  const completion = await api.calendars.completeCutover(MOCK_FACILITY_ID, cutover.id)
  if (!('completed' in completion)) throw new Error('完了できない')
}

describe('ほかの画面で先に操作されたとき', () => {
  it('ほかの画面でやめた後に、やめる前の確認でやめると、やめるの失敗の文を出し、始め直しても確認を開かない', async () => {
    const api = stories.openApi()
    renderWithApi(stories.Open, api)
    await userEvent.click(await screen.findByTestId('calendar-cutover-cancel'))
    const dialog = await screen.findByTestId('calendar-cutover-cancel-confirm-dialog')
    const { cutover } = await api.calendars.cutoverStatus(MOCK_FACILITY_ID)
    await api.calendars.cancelCutover(MOCK_FACILITY_ID, cutover?.id ?? '')

    await userEvent.click(within(dialog).getByTestId('calendar-cutover-cancel-confirm-submit'))
    expect(
      await within(dialog).findByTestId('calendar-cutover-cancel-confirm-error'),
    ).toHaveTextContent(
      'この切り替えは、ほかの画面で完了したか、やめています。画面を読み直してください。',
    )

    // 職員が、読み直してくださいに従って画面に戻り、切り替えの前の状態で始め直す
    await userEvent.click(within(dialog).getByTestId('calendar-cutover-cancel-confirm-cancel'))
    refocusWindow()
    await userEvent.click(await screen.findByTestId('calendar-cutover-start'))
    expect(await screen.findByTestId('calendar-cutover-open')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-cutover-cancel-confirm-dialog')).toBeNull()
  })

  it('やめる前の確認を開いたまま、ほかの画面でやめたことを読み直すと確認を閉じ、始め直しても確認を開かない', async () => {
    const api = stories.openApi()
    renderWithApi(stories.Open, api)
    await userEvent.click(await screen.findByTestId('calendar-cutover-cancel'))
    await screen.findByTestId('calendar-cutover-cancel-confirm-dialog')
    const { cutover } = await api.calendars.cutoverStatus(MOCK_FACILITY_ID)
    await api.calendars.cancelCutover(MOCK_FACILITY_ID, cutover?.id ?? '')

    refocusWindow()
    await userEvent.click(await screen.findByTestId('calendar-cutover-start'))
    expect(await screen.findByTestId('calendar-cutover-open')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-cutover-cancel-confirm-dialog')).toBeNull()
  })

  it('ほかの画面で始めた後に、始めると、始めるの失敗の文を出す', async () => {
    const api = stories.googlePrimaryApi()
    renderWithApi(stories.NotStarted, api)
    const start = await screen.findByTestId('calendar-cutover-start')
    await api.calendars.startCutover(MOCK_FACILITY_ID)

    await userEvent.click(start)
    expect(await screen.findByTestId('calendar-cutover-start-error')).toHaveTextContent(
      'この事業所では、ほかの画面で切り替えを始めています。画面を読み直してください。',
    )
  })

  it('ほかの画面で完了した後に、完了すると、完了の失敗の文を出す', async () => {
    const api = stories.openApi()
    renderWithApi(stories.Open, api)
    const complete = await screen.findByTestId('calendar-cutover-complete')
    await completeElsewhere(api)

    await userEvent.click(complete)
    expect(await screen.findByTestId('calendar-cutover-complete-error')).toHaveTextContent(
      'この切り替えは、ほかの画面で完了したか、やめています。画面を読み直してください。',
    )
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
