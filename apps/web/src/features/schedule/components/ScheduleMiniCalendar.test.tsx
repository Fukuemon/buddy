import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleMiniCalendar.stories'

const { Week, Month } = composeStories(stories)

describe('ScheduleMiniCalendar', () => {
  it('基準の日の月を出し、今日に aria-current を付ける', () => {
    render(<Week />)
    expect(screen.getByTestId('mini-calendar-month')).toHaveTextContent('2026年10月')
    expect(screen.getByRole('button', { name: '2026年10月20日' })).toHaveAttribute(
      'aria-current',
      'date',
    )
  })

  it('日を押すと、その日の YYYY-MM-DD を渡す', async () => {
    const onSelect = fn()
    render(<Week onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: '2026年10月28日' }))
    expect(onSelect).toHaveBeenCalledWith('2026-10-28')
  })

  it('週の表示では、出している 7 日に面の色を付ける', () => {
    render(<Week />)
    const cellOf = (dateKey: string) =>
      screen.getByTestId(`mini-calendar-day-${dateKey}`).closest('td')
    expect(cellOf('2026-10-18')).toHaveClass('bg-primary-surface')
    expect(cellOf('2026-10-24')).toHaveClass('bg-primary-surface')
    expect(cellOf('2026-10-25')).not.toHaveClass('bg-primary-surface')
  })

  it('月の表示では、期間の面の色を付けない', () => {
    render(<Month />)
    expect(screen.getByTestId('mini-calendar-day-2026-10-20').closest('td')).not.toHaveClass(
      'bg-primary-surface',
    )
  })

  it('前後のボタンはミニカレンダーの月だけを動かし、日を選ばない', async () => {
    const onSelect = fn()
    render(<Week onSelect={onSelect} />)
    await userEvent.click(screen.getByTestId('mini-calendar-next'))
    expect(screen.getByTestId('mini-calendar-month')).toHaveTextContent('2026年11月')
    await userEvent.click(screen.getByTestId('mini-calendar-prev'))
    await userEvent.click(screen.getByTestId('mini-calendar-prev'))
    expect(screen.getByTestId('mini-calendar-month')).toHaveTextContent('2026年9月')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('基準の日が別の月に変わると、その月に戻す', async () => {
    const { rerender } = render(<Week />)
    await userEvent.click(screen.getByTestId('mini-calendar-next'))
    await userEvent.click(screen.getByTestId('mini-calendar-next'))
    rerender(<Week date="2026-11-03" />)
    expect(screen.getByTestId('mini-calendar-month')).toHaveTextContent('2026年11月')
  })
})
