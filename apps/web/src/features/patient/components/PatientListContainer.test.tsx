import { composeStories, composeStory } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { refocusWindow } from '#/test/refocusWindow'

import * as stories from './PatientListContainer.stories'

const { Default, LoadError } = composeStories(stories)

const rowIds = () =>
  within(screen.getByTestId('patient-list-table'))
    .getAllByRole('row')
    .map((row) => row.dataset.testid)
    .filter((id) => id !== undefined)

describe('PatientListContainer', () => {
  it('開いた直後は利用中の利用者だけを名前の順に並べ、休職の担当には状態を添え、行に詳細へのリンクを付ける', async () => {
    render(<Default />)
    expect(await screen.findByTestId('patient-list-count')).toHaveTextContent('4 人')
    expect(rowIds()).toEqual([
      'patient-list-row-patient-1',
      'patient-list-row-patient-3',
      'patient-list-row-patient-4',
      'patient-list-row-patient-2',
    ])
    expect(screen.queryByRole('columnheader', { name: '状態' })).toBeNull()
    const row = screen.getByTestId('patient-list-row-patient-2')
    expect(row).toHaveTextContent('石川 二葉（休職）')
    expect(row).toHaveTextContent('訪看I3')
    expect(row).toHaveTextContent('午後')
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/patients/patient-2')
  })

  it('利用の終了を選ぶと利用の終了にした日の列を足し、すべてを選ぶと利用の終了の行にだけ状態の印を出す', async () => {
    render(<Default />)
    const status = await screen.findByTestId('patient-list-filter-status')
    await userEvent.selectOptions(status, '状態: 利用の終了')
    expect(rowIds()).toEqual(['patient-list-row-patient-ended'])
    expect(screen.getByRole('columnheader', { name: '利用の終了にした日' })).toBeInTheDocument()
    expect(screen.getByTestId('patient-list-ended-on-patient-ended')).toHaveTextContent(
      '2026/10/01 に利用の終了',
    )

    await userEvent.selectOptions(status, '状態: すべて')
    expect(screen.getByTestId('patient-list-count')).toHaveTextContent('5 人')
    expect(screen.getByTestId('patient-list-status-patient-ended')).toHaveTextContent(
      '利用の終了（2026/10/01）',
    )
    expect(screen.queryByTestId('patient-list-status-patient-1')).toBeNull()
  })

  it('担当の職員で絞り込み、0 件なら絞り込みを外すと開いた直後に戻る', async () => {
    render(<Default />)
    const staff = await screen.findByTestId('patient-list-filter-staff')
    await userEvent.selectOptions(staff, '担当の職員: 石川 二葉')
    expect(rowIds()).toEqual(['patient-list-row-patient-2'])

    const search = screen.getByTestId('patient-list-search')
    await userEvent.type(search, '加藤')
    expect(screen.getByTestId('patient-list-empty')).toHaveTextContent(
      '条件に合う利用者はいません。',
    )
    expect(screen.getByTestId('patient-list-count')).toHaveTextContent('0 人')

    await userEvent.click(screen.getByTestId('patient-list-filter-clear'))
    expect(search).toHaveValue('')
    expect(staff).toHaveValue('')
    expect(screen.getByTestId('patient-list-filter-status')).toHaveValue('active')
    expect(screen.getByTestId('patient-list-count')).toHaveTextContent('4 人')
  })

  it('読めなかったときは、警告の文と読み直すを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('patient-list-error')).toHaveTextContent(
      '利用者を読み込めませんでした。時間をおいて、読み直してください。',
    )
    expect(screen.getByTestId('patient-list-retry')).toBeInTheDocument()
  })

  it('読み終えた後に読み直して利用者を読めなければ、表示を残して失敗の文を出し、読み直すで読めたら消す', async () => {
    const Story = composeStory(
      {
        ...stories.RefetchError,
        parameters: {
          appRouter: { ...stories.default.parameters.appRouter, api: stories.refetchFailingApi() },
        },
      },
      stories.default,
    )
    render(<Story />)
    await screen.findByTestId('patient-list-table')

    refocusWindow()
    expect(await screen.findByTestId('refetch-error')).toHaveTextContent(
      '最新の情報を読み込めませんでした。',
    )
    expect(screen.getByTestId('patient-list-table')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('refetch-retry'))
    await expect.poll(() => screen.queryByTestId('refetch-error')).toBeNull()
    expect(screen.getByTestId('patient-list-table')).toBeInTheDocument()
  })
})
