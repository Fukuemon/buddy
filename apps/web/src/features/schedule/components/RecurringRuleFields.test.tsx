import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './RecurringRuleFields.stories'

const { BiweeklyDays, CustomWeeklyInvalid, EveryThreeWeeks, Weekly } = composeStories(stories)

const optionLabels = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent)

describe('RecurringRuleFields', () => {
  it('間隔 1 の毎週は、選択肢に「毎週」を出す', async () => {
    render(<Weekly />)
    const preset = await screen.findByTestId('recurring-rule-preset')
    expect(preset).toHaveValue('weekly')
    expect(optionLabels(preset)).toEqual([
      '毎週 火曜日',
      '毎月 20 日',
      '毎月 第 3 火曜日',
      'カスタム…',
    ])
  })

  it('複数の曜日の隔週は、今の規則の選択肢を曜日の並びのまま先頭に出して選び、開いた回の曜日の選択肢にも隔週を出す', async () => {
    render(<BiweeklyDays />)
    const preset = await screen.findByTestId('recurring-rule-preset')
    expect(preset).toHaveValue('current')
    expect(optionLabels(preset)).toEqual([
      '隔週 月曜日、木曜日',
      '隔週 木曜日',
      '毎月 22 日',
      '毎月 第 4 木曜日',
      'カスタム…',
    ])

    await userEvent.selectOptions(preset, 'weekly')
    expect(preset).toHaveValue('weekly')
    await userEvent.selectOptions(preset, 'current')
    expect(preset).toHaveValue('current')
  })

  it('「カスタム…」は、今の規則の間隔と曜日の並びのまま、間隔と曜日の欄を開く', async () => {
    render(<BiweeklyDays />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'custom')
    expect(optionLabels(screen.getByTestId('recurring-rule-frequency'))).toEqual(['隔週', '毎月'])
    expect(screen.getByTestId('recurring-rule-interval')).toHaveValue(2)
    expect(screen.getByTestId('recurring-rule-day-of-week-1')).toBeChecked()
    expect(screen.getByTestId('recurring-rule-day-of-week-4')).toBeChecked()
    expect(screen.getByTestId('recurring-rule-day-of-week-2')).not.toBeChecked()
  })

  it('曜日は押すたびに足し外しでき、間隔を変えると繰り返すの文言も変わる', async () => {
    render(<Weekly />)
    await userEvent.selectOptions(await screen.findByTestId('recurring-rule-preset'), 'custom')
    const friday = screen.getByTestId('recurring-rule-day-of-week-5')
    await userEvent.click(friday)
    expect(friday).toBeChecked()
    expect(screen.getByTestId('recurring-rule-day-of-week-2')).toBeChecked()
    await userEvent.click(friday)
    expect(friday).not.toBeChecked()

    const interval = screen.getByTestId('recurring-rule-interval')
    await userEvent.clear(interval)
    await userEvent.type(interval, '3')
    expect(optionLabels(screen.getByTestId('recurring-rule-frequency'))).toEqual([
      '3 週ごと',
      '毎月',
    ])
  })

  it('曜日と間隔の誤りの文を、それぞれの欄の下に出す', async () => {
    render(<CustomWeeklyInvalid />)
    expect(await screen.findByText('曜日を 1 つ以上選んでください')).toBeInTheDocument()
    expect(screen.getByText('間隔は 1〜52 の週の数で入力してください')).toBeInTheDocument()
    expect(screen.getByTestId('recurring-rule-interval')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('group', { name: '曜日' })).toHaveAccessibleDescription(
      '曜日を 1 つ以上選んでください',
    )
  })

  it('3 週ごとは、選択肢に「3 週ごと」を出す', async () => {
    render(<EveryThreeWeeks />)
    const preset = await screen.findByTestId('recurring-rule-preset')
    expect(preset).toHaveValue('weekly')
    expect(within(preset).getByRole('option', { name: '3 週ごと 火曜日' })).toBeInTheDocument()
  })
})
