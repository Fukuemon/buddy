import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AppRouterParameters } from '#/storybook/withAppRouter'

import { isoWeekdayOf } from '../schema/recurringRuleForm'
import { tokyoDateFromToday } from './storyData'
import * as stories from './ScheduleRecurrenceModalContainer.stories'

const { Past, Replaced, StartsCustom, Weekly } = composeStories(stories)

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

  it('今日より前の回では、欄を出さずに変えられない理由を出す', async () => {
    render(<Past />)
    expect(await screen.findByTestId('schedule-recurrence-blocked')).toHaveTextContent(
      '今日より前の回からは、繰り返しを変えられません。',
    )
    expect(screen.queryByTestId('schedule-recurrence-submit')).not.toBeInTheDocument()
  })

  it('1 回を置き換えた予定では、欄を出さずに変えられない理由を出す', async () => {
    render(<Replaced />)
    expect(await screen.findByTestId('schedule-recurrence-blocked')).toHaveTextContent(
      '1 回だけ変えた予定のため',
    )
  })
})
