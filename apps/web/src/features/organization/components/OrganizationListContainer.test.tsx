import { composeStories, composeStory } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { refocusWindow } from '#/test/refocusWindow'

import * as stories from './OrganizationListContainer.stories'

const { Default, Empty, LoadError } = composeStories(stories)

const rowTexts = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent)

const checkedColor = () =>
  within(screen.getByTestId('organization-list-team-color')).getByRole('radio', { checked: true })

describe('OrganizationListContainer', () => {
  it('部署とチームを名前の順に並べ、チームの名前の前にチームの色の点を置く', async () => {
    render(<Default />)
    expect(await screen.findByTestId('organization-list-department-table')).toBeInTheDocument()
    expect(rowTexts('organization-list-department-table')).toEqual(['リハビリ部', '訪問看護部'])
    expect(rowTexts('organization-list-team-table')).toEqual(['A チーム', 'B チーム'])
    expect(
      screen.getByTestId('organization-list-team-name-team-b').querySelector('.bg-team-orange'),
    ).not.toBeNull()
    expect(
      screen.getByTestId('organization-list-department-edit-department-2'),
    ).toHaveAccessibleName('リハビリ部を編集')
  })

  it('チームを作るときは、使っていない先頭の色を選んで始め、選んだ色でチームを作って一覧に足す', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('organization-list-team-new'))
    expect(screen.getByTestId('organization-list-team-name')).toHaveFocus()
    expect(checkedColor()).toHaveAccessibleName('赤紫')
    await userEvent.type(screen.getByTestId('organization-list-team-name'), '  C チーム ')
    await userEvent.click(screen.getByTestId('organization-list-team-color-lime'))
    await userEvent.click(screen.getByTestId('organization-list-team-submit'))
    expect(await screen.findByText('C チーム')).toBeInTheDocument()
    expect(screen.queryByTestId('organization-list-team-dialog')).toBeNull()
    const row = screen.getByTestId('organization-list-team-table').querySelectorAll('tbody tr')[2]
    expect(row?.querySelector('.bg-team-lime')).not.toBeNull()
  })

  it('チームの編集は今の名前と色で開き、色を変えて保存すると点の色が変わる', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('organization-list-team-edit-team-a'))
    expect(screen.getByTestId('organization-list-team-name')).toHaveValue('A チーム')
    expect(checkedColor()).toHaveAccessibleName('青')
    await userEvent.click(screen.getByTestId('organization-list-team-color-green'))
    await userEvent.click(screen.getByTestId('organization-list-team-submit'))
    expect(await screen.findByTestId('organization-list-team-new')).toBeInTheDocument()
    expect(screen.queryByTestId('organization-list-team-dialog')).toBeNull()
    expect(
      screen.getByTestId('organization-list-team-name-team-a').querySelector('.bg-team-green'),
    ).not.toBeNull()
  })

  it('名前が空白だけなら送らずに誤りを出し、入れ直すと消す', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('organization-list-department-new'))
    await userEvent.type(screen.getByTestId('organization-list-department-name'), ' ')
    await userEvent.click(screen.getByTestId('organization-list-department-submit'))
    expect(screen.getByTestId('organization-list-department-error-name')).toHaveTextContent(
      '名前を入れてください',
    )
    expect(screen.getByTestId('organization-list-department-name')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await userEvent.type(screen.getByTestId('organization-list-department-name'), '外来')
    expect(screen.queryByTestId('organization-list-department-error-name')).toBeNull()
  })

  it('同じ名前の部署があれば、閉じずに理由を出して入れた値を残し、名前を変えると保存できる', async () => {
    render(<Default />)
    await userEvent.click(
      await screen.findByTestId('organization-list-department-edit-department-1'),
    )
    const name = screen.getByTestId('organization-list-department-name')
    await userEvent.clear(name)
    await userEvent.type(name, 'リハビリ部')
    await userEvent.click(screen.getByTestId('organization-list-department-submit'))
    expect(
      await screen.findByTestId('organization-list-department-submit-error'),
    ).toHaveTextContent(
      '「リハビリ部」という名前の部署は、すでにあります。別の名前にしてください。',
    )
    expect(name).toHaveValue('リハビリ部')
    await userEvent.clear(name)
    await userEvent.type(name, '看護部')
    await userEvent.click(screen.getByTestId('organization-list-department-submit'))
    expect(await screen.findByText('看護部')).toBeInTheDocument()
    expect(screen.queryByTestId('organization-list-department-dialog')).toBeNull()
  })

  it('キャンセルは何も変えずに閉じる', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('organization-list-team-edit-team-b'))
    await userEvent.clear(screen.getByTestId('organization-list-team-name'))
    await userEvent.click(screen.getByTestId('organization-list-team-cancel'))
    expect(screen.queryByTestId('organization-list-team-dialog')).toBeNull()
    expect(rowTexts('organization-list-team-table')).toEqual(['A チーム', 'B チーム'])
  })

  it('部署もチームも無ければ、まとまりごとに無いことの文を出し、作るボタンは残す', async () => {
    render(<Empty />)
    expect(await screen.findByTestId('organization-list-department-empty')).toHaveTextContent(
      '部署はまだありません。',
    )
    expect(screen.getByTestId('organization-list-team-empty')).toHaveTextContent(
      'チームはまだありません。',
    )
    expect(screen.getByTestId('organization-list-team-new')).toBeInTheDocument()
  })

  it('読めなければ、読み込みの失敗の文と読み直すボタンを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('organization-list-error')).toHaveTextContent(
      '部署とチームを読み込めませんでした。時間をおいて、読み直してください。',
    )
    expect(screen.getByTestId('organization-list-retry')).toBeInTheDocument()
  })

  it('読み終えた後に読み直して部署を読めなければ、表示を残して失敗の文を出し、読み直すで読めたら消す', async () => {
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
    await screen.findByTestId('organization-list-department-table')

    refocusWindow()
    expect(await screen.findByTestId('refetch-error')).toHaveTextContent(
      '最新の情報を読み込めませんでした。',
    )
    expect(screen.getByTestId('organization-list-department-table')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('refetch-retry'))
    await expect.poll(() => screen.queryByTestId('refetch-error')).toBeNull()
    expect(screen.getByTestId('organization-list-department-table')).toBeInTheDocument()
  })
})
