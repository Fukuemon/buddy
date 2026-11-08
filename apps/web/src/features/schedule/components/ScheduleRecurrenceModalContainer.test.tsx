import { composeStories } from '@storybook/react-vite'
import { focusManager } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { ApiError } from '#/api/BuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'
import type { AppRouterParameters } from '#/storybook/withAppRouter'

import { isoWeekdayOf } from '../schema/recurringRuleForm'
import { tokyoDateFromToday } from './storyData'
import * as stories from './ScheduleRecurrenceModalContainer.stories'

const {
  Cutover,
  GooglePrimary,
  OccurrenceGone,
  Past,
  Replaced,
  RuleChangedInGoogle,
  StaleCutoverCache,
  StartsCustom,
  Weekly,
} = composeStories(stories)

const apiOf = (parameters: { appRouter?: unknown }) => {
  const { api, history } = parameters.appRouter as AppRouterParameters
  if (api === undefined) throw new Error('story にフェイクの API が無い')
  return { api, history }
}

describe('ScheduleRecurrenceModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    focusManager.setFocused(undefined)
  })

  it('開いた回の日から作った選択肢のうち、今の規則と同じものを選び、終了を「なし」にして始める', async () => {
    render(<Weekly />)
    const preset = await screen.findByTestId('recurring-rule-preset')
    expect(preset).toHaveValue('weekly')
    expect(screen.queryByTestId('recurring-rule-frequency')).not.toBeInTheDocument()
    expect(screen.getByTestId('recurring-rule-ends-never')).toBeChecked()
    expect(screen.getByTestId('recurring-rule-end-date')).toBeDisabled()
    expect(screen.getByTestId('schedule-recurrence-summary')).toHaveTextContent('09:00〜09:29')
  })

  it('「カスタム…」を選ぶと、同じモーダルの中に、繰り返すと曜日の欄を開く', async () => {
    render(<Weekly />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'custom')

    expect(screen.getByTestId('recurring-rule-frequency')).toHaveValue('weekly')
    const weekday = isoWeekdayOf(tokyoDateFromToday(1))
    expect(screen.getByTestId(`recurring-rule-day-of-week-${weekday}`)).toBeChecked()
  })

  it('「カスタム…」で曜日を足し、間隔を 2 にして保存すると、曜日の並びと間隔を送る', async () => {
    const { api, history } = apiOf(Weekly.parameters)
    if (history === undefined) throw new Error('story に履歴が無い')
    const opened = '/schedule/recurring-occurrence/recurrence'
    history.push(opened)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Weekly />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'custom')
    const weekday = isoWeekdayOf(tokyoDateFromToday(1))
    const other = (weekday % 7) + 1
    await userEvent.click(screen.getByTestId(`recurring-rule-day-of-week-${other}`))
    await userEvent.clear(screen.getByTestId('recurring-rule-interval'))
    await userEvent.type(screen.getByTestId('recurring-rule-interval'), '2')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    await waitFor(() => expect(changeRule).toHaveBeenCalledOnce())
    expect(changeRule.mock.calls[0]?.[2].rule).toMatchObject({
      frequency: 'weekly',
      daysOfWeek: [weekday, other].sort((a, b) => a - b),
      interval: 2,
    })
    // 保存するとカレンダーへ移り、同じ story の後のテストが欄を開けないので、開いた URL に戻す
    history.push(opened)
  })

  it('曜日を全て外すか、間隔を 53 にして保存すると、誤りの文を出し、規則の変更を送らない', async () => {
    const { api } = apiOf(Weekly.parameters)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Weekly />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'custom')
    const weekday = isoWeekdayOf(tokyoDateFromToday(1))
    await userEvent.click(screen.getByTestId(`recurring-rule-day-of-week-${weekday}`))
    await userEvent.clear(screen.getByTestId('recurring-rule-interval'))
    await userEvent.type(screen.getByTestId('recurring-rule-interval'), '53')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    expect(await screen.findByText('曜日を 1 つ以上選んでください')).toBeInTheDocument()
    expect(screen.getByText('間隔は 1〜52 の週の数で入力してください')).toBeInTheDocument()
    expect(changeRule).not.toHaveBeenCalled()
  })

  it('今の規則が選択肢のどれとも違えば、「カスタム…」を開いた形で始める', async () => {
    render(<StartsCustom />)
    expect(await screen.findByTestId('recurring-rule-preset')).toHaveValue('custom')
    expect(screen.getByTestId('recurring-rule-frequency')).toBeInTheDocument()
  })

  it('繰り返しを変えずに保存すると、変えることを促し、規則の変更を送らない', async () => {
    const { api } = apiOf(Weekly.parameters)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Weekly />)
    await userEvent.click(await screen.findByTestId('schedule-recurrence-submit'))

    expect(await screen.findByText('今の繰り返しから変えてください')).toBeInTheDocument()
    expect(changeRule).not.toHaveBeenCalled()
  })

  it('終了日だけを変えると、今の規則の終了日だけを替えて送る', async () => {
    const { api } = apiOf(Weekly.parameters)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Weekly />)
    await userEvent.click(await screen.findByTestId('recurring-rule-ends-on'))
    await userEvent.clear(screen.getByTestId('recurring-rule-end-date'))
    await userEvent.type(screen.getByTestId('recurring-rule-end-date'), '2099-12-31')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    await waitFor(() => expect(changeRule).toHaveBeenCalledOnce())
    expect(changeRule.mock.calls[0]?.[2].rule).toEqual({
      frequency: 'weekly',
      daysOfWeek: null,
      interval: 1,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: '2099-12-31',
    })
  })

  it('「毎月 <日>」を選んで保存すると、開いた回の日を適用の日にして規則の変更を送り、予定のカレンダーへ戻る', async () => {
    const { api, history } = apiOf(Weekly.parameters)
    if (history === undefined) throw new Error('story に履歴が無い')
    history.push('/schedule/recurring-occurrence/recurrence')
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Weekly />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'monthly-day')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    await waitFor(() => expect(history.location.pathname).toBe('/schedule'))
    const opened = tokyoDateFromToday(1)
    const [, recurringId, change, etag] = changeRule.mock.calls[0] ?? []
    expect(recurringId).toBe('recurring-1')
    expect(change).toMatchObject({
      effectiveDate: opened,
      firstWeekDate: opened,
      rule: {
        frequency: 'monthly',
        daysOfWeek: null,
        interval: null,
        dayOfWeek: null,
        dayOfMonth: Number(opened.slice(8, 10)),
        weekOfMonth: null,
        endDate: null,
      },
    })
    expect(change?.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(etag).toBeNull()
    expect(new URLSearchParams(history.location.search).get('date')).toBe(opened)
  })

  it('今日より前の回では、今日以降の回を変えることを出し、今日を適用の日に、開いた回の日を 1 週目を決める日にして送る', async () => {
    const { api } = apiOf(Past.parameters)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Past />)
    expect(await screen.findByTestId('schedule-recurrence-lead')).toHaveTextContent(
      '今日より前の回は変わりません。',
    )
    await userEvent.selectOptions(screen.getByTestId('recurring-rule-preset'), 'monthly-day')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    await waitFor(() => expect(changeRule).toHaveBeenCalledOnce())
    expect(changeRule.mock.calls[0]?.[2]).toMatchObject({
      effectiveDate: tokyoDateFromToday(0),
      firstWeekDate: tokyoDateFromToday(-1),
    })
  })

  it('1 回を置き換えた予定は単発の予定として扱い、欄を出さずに変えられない理由を出す', async () => {
    render(<Replaced />)
    expect(await screen.findByTestId('schedule-recurrence-blocked')).toHaveTextContent(
      '繰り返しの予定の回ではないため',
    )
  })

  it('終了日の「あり」の右の日付の欄は、見出しを見せずに、読み上げの名前を「終了日」にする', async () => {
    // 履歴は story の間で共有し、前のテストの保存でカレンダーへ移っているので、繰り返しの変更の URL に戻す
    apiOf(Weekly.parameters).history?.push('/schedule/recurring-occurrence/recurrence')
    render(<Weekly />)
    expect(await screen.findByRole('radio', { name: 'あり' })).toBeInTheDocument()
    expect(screen.getByLabelText('終了日', { selector: 'input' })).toHaveAttribute(
      'data-testid',
      'recurring-rule-end-date',
    )
  })

  it('Google カレンダーで親の規則が変わり、開いた回が無くなっていたら、開き直すことを出し、保存を押せなくする', async () => {
    render(<OccurrenceGone />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'monthly-day')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    expect(await screen.findByTestId('schedule-recurrence-error')).toHaveTextContent(
      '予定のカレンダーから開き直し、最新の繰り返しを確認してください。',
    )
    expect(screen.getByTestId('schedule-recurrence-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('Google カレンダーで規則が変わっていたら、開いた回が残っていても、開き直すことを出し、保存を押せなくする', async () => {
    const { api } = apiOf(RuleChangedInGoogle.parameters)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<RuleChangedInGoogle />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'monthly-day')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    expect(await screen.findByTestId('schedule-recurrence-error')).toHaveTextContent(
      '最新の繰り返しを確認してください。',
    )
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))
    expect(changeRule).toHaveBeenCalledOnce()
  })

  it('予定の正本を切り替えている間に開くと、欄と保存のボタンを出さずに、切り替えていることと閉じるボタンを出す', async () => {
    render(<Cutover />)
    expect(await screen.findByTestId('schedule-recurrence-cutover')).toHaveTextContent(
      '予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。',
    )
    expect(screen.getByTestId('modal-close')).toBeInTheDocument()
    expect(screen.queryByTestId('recurring-rule-preset')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-recurrence-submit')).not.toBeInTheDocument()
  })

  it('google_primary の事業所で切り替えていなければ欄を出し、開いた後に切り替えが始まっても欄を残し、保存の失敗で知らせる', async () => {
    const { api } = apiOf(GooglePrimary.parameters)
    const list = vi.spyOn(api.schedules, 'list')
    render(<GooglePrimary />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'monthly-day')

    await api.calendars.startCutover(MOCK_FACILITY_ID)
    const listed = list.mock.calls.length
    // 窓に戻ったときの読み直しで、一覧が切り替えを返しても、開いたときの状態のままにする
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(listed))
    // 読み直した一覧が cache に入り、描き直し終えてから確かめる
    await act(async () => {
      await list.mock.results.at(-1)?.value
    })
    expect(screen.queryByTestId('schedule-recurrence-cutover')).not.toBeInTheDocument()
    expect(screen.getByTestId('recurring-rule-preset')).toHaveValue('monthly-day')

    vi.spyOn(api.schedules, 'changeRule').mockRejectedValue(
      new ApiError(409, '切り替えています', [], 'cutover_open'),
    )
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))
    expect(await screen.findByTestId('schedule-recurrence-error')).toHaveTextContent(
      '予定の正本を buddy に切り替えています。',
    )
  })

  it('予定の一覧の cache に切り替え中の古い結果が残っていても、開いてから読み直した一覧が切り替えていなければ欄を出す', async () => {
    render(<StaleCutoverCache />)
    expect(await screen.findByTestId('recurring-rule-preset')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-recurrence-cutover')).not.toBeInTheDocument()
  })
})
