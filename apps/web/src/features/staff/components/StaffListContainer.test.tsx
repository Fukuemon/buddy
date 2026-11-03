import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffListContainer.stories'

const { Default, LoadError } = composeStories(stories)

const rowIds = () =>
  within(screen.getByTestId('staff-list-table'))
    .getAllByRole('row')
    .map((row) => row.dataset.testid)
    .filter((id) => id !== undefined)

describe('StaffListContainer', () => {
  it('開いた直後は有効の職員だけを、チームの順、名前の順に並べ、行に詳細へのリンクを付ける', async () => {
    render(<Default />)
    expect(await screen.findByTestId('staff-list-count')).toHaveTextContent('2 人')
    expect(rowIds()).toEqual(['staff-list-row-staff-1', 'staff-list-row-staff-3'])
    expect(screen.getByRole('columnheader', { name: 'チーム' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '状態' })).toBeNull()
    const row = screen.getByTestId('staff-list-row-staff-1')
    expect(row.querySelector('.bg-team-blue')).not.toBeNull()
    expect(within(screen.getByTestId('staff-list-row-staff-1')).getByRole('link')).toHaveAttribute(
      'href',
      '/staff/staff-1',
    )
  })

  it('休職を選ぶと戻る予定の日の列を、退職を選ぶと退職した日の列を足す', async () => {
    render(<Default />)
    const status = await screen.findByTestId('staff-list-filter-status')
    await userEvent.selectOptions(status, '状態: 休職')
    expect(screen.getByTestId('staff-list-leave-return-staff-2')).toHaveTextContent(
      '2027/04/01 に戻る予定',
    )
    await userEvent.selectOptions(status, '状態: 退職')
    expect(screen.getByTestId('staff-list-retired-on-staff-4')).toHaveTextContent(
      '2026/09/30 に退職',
    )
    expect(rowIds()).toEqual(['staff-list-row-staff-4'])
  })

  it('すべてを選ぶと、休職と退職の行にだけ状態の印を出す', async () => {
    render(<Default />)
    await userEvent.selectOptions(
      await screen.findByTestId('staff-list-filter-status'),
      '状態: すべて',
    )
    expect(screen.getByTestId('staff-list-count')).toHaveTextContent('4 人')
    expect(screen.getByTestId('staff-list-status-staff-2')).toHaveTextContent(
      '休職（2027/04/01 に戻る予定）',
    )
    expect(screen.queryByTestId('staff-list-status-staff-1')).toBeNull()
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
    expect(screen.getByTestId('staff-list-filter-status')).toHaveValue('active')
    expect(screen.getByTestId('staff-list-count')).toHaveTextContent('2 人')
  })

  it('読めなかったときは、警告の文と読み直すを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('staff-list-error')).toHaveTextContent(
      '職員を読み込めませんでした。時間をおいて、読み直してください。',
    )
    expect(screen.getByTestId('staff-list-retry')).toBeInTheDocument()
  })
})
