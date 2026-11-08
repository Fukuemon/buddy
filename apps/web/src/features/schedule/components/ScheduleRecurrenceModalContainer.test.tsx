import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AppRouterParameters } from '#/storybook/withAppRouter'

import { isoWeekdayOf } from '../schema/recurringRuleForm'
import { tokyoDateFromToday } from './storyData'
import * as stories from './ScheduleRecurrenceModalContainer.stories'

const { OccurrenceGone, Past, Replaced, StartsCustom, Weekly } = composeStories(stories)

const apiOf = (parameters: { appRouter?: unknown }) => {
  const { api, history } = parameters.appRouter as AppRouterParameters
  if (api === undefined) throw new Error('story にフェイクの API が無い')
  return { api, history }
}

describe('ScheduleRecurrenceModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
      rule: {
        frequency: 'monthly',
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

  it('今日より前の回では、今日以降の回を変えることを出し、今日を適用の日にして送る', async () => {
    const { api } = apiOf(Past.parameters)
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<Past />)
    expect(await screen.findByTestId('schedule-recurrence-lead')).toHaveTextContent(
      '今日より前の回は変わりません。',
    )
    await userEvent.selectOptions(screen.getByTestId('recurring-rule-preset'), 'monthly-day')
    await userEvent.click(screen.getByTestId('schedule-recurrence-submit'))

    await waitFor(() => expect(changeRule).toHaveBeenCalledOnce())
    expect(changeRule.mock.calls[0]?.[2].effectiveDate).toBe(tokyoDateFromToday(0))
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
      '予定のカレンダーから開き直してください。',
    )
    expect(screen.getByTestId('schedule-recurrence-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
