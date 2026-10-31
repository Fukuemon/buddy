import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffListContainer.stories'

const { Default, Forbidden, LoadError } = composeStories(stories)

const rowIds = () =>
  within(screen.getByTestId('staff-list-table'))
    .getAllByRole('row')
    .map((row) => row.dataset.testid)
    .filter((id) => id !== undefined)

describe('StaffListContainer', () => {
  it('開いた直後は在籍の職員を出し、休職の職員に戻る予定の日を、行に詳細へのリンクを付ける', async () => {
    render(<Default />)
    expect(await screen.findByTestId('staff-list-count')).toHaveTextContent('3 人')
    expect(screen.getByTestId('staff-list-status-staff-2')).toHaveTextContent(
      '休職（2027/04/01 に戻る予定）',
    )
    expect(screen.queryByTestId('staff-list-row-staff-4')).toBeNull()
    expect(within(screen.getByTestId('staff-list-row-staff-1')).getByRole('link')).toHaveAttribute(
      'href',
      '/staff/staff-1',
    )
  })

  it('状態の「すべて」で退職の職員も出し、退職にした日とメールアドレスなしを出す', async () => {
    render(<Default />)
    await userEvent.selectOptions(
      await screen.findByTestId('staff-list-filter-status'),
      '状態: すべて',
    )
    expect(screen.getByTestId('staff-list-count')).toHaveTextContent('4 人')
    expect(screen.getByTestId('staff-list-status-staff-4')).toHaveTextContent('退職（2026/09/30）')
    expect(screen.getByTestId('staff-list-row-staff-4')).toHaveTextContent('メールアドレスなし')
  })

  it('名前の一部は空白の違いを無視して絞り込み、0 件なら絞り込みを外すと開いた直後に戻る', async () => {
    render(<Default />)
    const search = await screen.findByTestId('staff-list-search')
    await userEvent.type(search, '上田三')
    expect(rowIds()).toEqual(['staff-list-row-staff-3'])

    await userEvent.selectOptions(screen.getByTestId('staff-list-filter-team'), 'チーム: A チーム')
    expect(screen.getByTestId('staff-list-empty')).toHaveTextContent('条件に合う職員はいません。')
    expect(screen.getByTestId('staff-list-count')).toHaveTextContent('0 人')

    await userEvent.click(screen.getByTestId('staff-list-filter-clear'))
    expect(search).toHaveValue('')
    expect(screen.getByTestId('staff-list-filter-team')).toHaveValue('')
    expect(screen.getByTestId('staff-list-count')).toHaveTextContent('3 人')
  })

  it('読めなかったときは、警告の文と読み直すを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('staff-list-error')).toHaveTextContent(
      '職員を読み込めませんでした。時間をおいて、読み直してください。',
    )
    expect(screen.getByTestId('staff-list-retry')).toBeInTheDocument()
  })

  it('職員の管理の権限が無ければ、一覧と登録のボタンを出さずに権限が無いことを示す', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-list-new')).toBeNull()
  })
})
