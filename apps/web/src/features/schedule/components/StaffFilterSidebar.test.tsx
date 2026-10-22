import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffFilterSidebar.stories'

const { AllStaff, OnlyViewer, PartiallySelected } = composeStories(stories)

describe('StaffFilterSidebar', () => {
  it('全員の表示から 1 人を外すと、残りの職員を選ぶ', async () => {
    const onChange = fn()
    render(<AllStaff onChange={onChange} />)
    await userEvent.click(screen.getByTestId('staff-filter-staff-staff-2'))
    expect(onChange).toHaveBeenCalledWith(['staff-1', 'staff-3', 'staff-4'])
  })

  it('チームを選ぶとメンバーを全員足し、全員になったら空の配列にする', async () => {
    const onChange = fn()
    render(<PartiallySelected onChange={onChange} />)
    expect(screen.getByTestId('staff-filter-team-team-a')).toHaveProperty('indeterminate', true)

    await userEvent.click(screen.getByTestId('staff-filter-team-team-a'))
    expect(onChange).toHaveBeenCalledWith(['staff-1', 'staff-3', 'staff-2'])
  })

  it('最後の 1 人は外せない', async () => {
    const onChange = fn()
    render(<PartiallySelected onChange={onChange} selectedStaffIds={['staff-1']} />)
    await userEvent.click(screen.getByTestId('staff-filter-staff-staff-1'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('職員のチェックボックスを、カレンダーの予定と同じ並びの区別の色で出す', () => {
    render(<AllStaff />)
    expect(screen.getByTestId('staff-filter-staff-staff-1').style.accentColor).toBe(
      'var(--buddy-color-categorical-1)',
    )
    expect(screen.getByTestId('staff-filter-staff-staff-3').style.accentColor).toBe(
      'var(--buddy-color-categorical-3)',
    )
  })

  it('名前の検索は一覧の表示だけを絞り、消すとチェックの状態のまま戻る', async () => {
    const onChange = fn()
    render(<PartiallySelected onChange={onChange} />)
    const search = screen.getByRole('searchbox', { name: '職員の名前で絞り込む' })

    await userEvent.type(search, '上田')
    expect(screen.getByTestId('staff-filter-staff-staff-3')).toBeChecked()
    expect(screen.queryByTestId('staff-filter-staff-staff-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('staff-filter-team-team-a')).not.toBeInTheDocument()

    await userEvent.clear(search)
    expect(screen.getByTestId('staff-filter-staff-staff-1')).toBeChecked()
    expect(screen.getByTestId('staff-filter-staff-staff-2')).not.toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('名前に語を含む職員がいないと、案内の文を出す', async () => {
    render(<AllStaff />)
    await userEvent.type(
      screen.getByRole('searchbox', { name: '職員の名前で絞り込む' }),
      '該当なし',
    )
    expect(screen.getByTestId('staff-filter-no-match')).toHaveTextContent(
      '名前に「該当なし」を含む職員はいません。',
    )
  })

  it('自分だけを押すと、ログインした職員だけを選ぶ', async () => {
    const onChange = fn()
    render(<AllStaff onChange={onChange} />)
    await userEvent.click(screen.getByTestId('staff-filter-only-me'))
    expect(onChange).toHaveBeenCalledWith(['staff-1'])
  })

  it('自分だけを出している間は、自分だけを押せない', () => {
    render(<OnlyViewer />)
    expect(screen.getByTestId('staff-filter-only-me')).toBeDisabled()
  })

  it('ログインした職員が一覧にいないと、自分だけを出さない', () => {
    render(<AllStaff viewerStaffId="staff-unknown" />)
    expect(screen.queryByTestId('staff-filter-only-me')).not.toBeInTheDocument()
  })
})
