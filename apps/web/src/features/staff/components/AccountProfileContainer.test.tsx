import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { FAKE_VIEWER } from '#/api/fake/fixtures'

import * as stories from './AccountProfileContainer.stories'

const { Default, LoadError, Manager, NoPolicies, NotLinked } = composeStories(stories)

describe('AccountProfileContainer', () => {
  it('職員の管理の権限を持たない職員に、名前、メール、部署、チーム、役職、カレンダーの連携を出し、職員の詳細へのリンクを出さない', async () => {
    render(<Default />)
    expect(await screen.findByTestId('account-profile-name')).toHaveTextContent('青木 一郎')
    expect(screen.getByTestId('account-profile-email')).toHaveTextContent('staff-1@example.com')
    expect(screen.getByTestId('account-profile-department')).toHaveTextContent('訪問看護部')
    expect(screen.getByTestId('account-profile-team')).toHaveTextContent('A チーム')
    expect(screen.getByTestId('account-profile-position')).toHaveTextContent('看護師')
    expect(screen.getByTestId('account-profile-calendar-id')).toHaveTextContent(
      'staff-1@example.com',
    )
    expect(screen.getByTestId('account-profile-last-import')).toBeInTheDocument()
    expect(screen.queryByTestId('account-profile-staff-detail')).toBeNull()
  })

  it('持っている権限を、予定の権限の順に権限の名前で並べ、対象を指定した権限には対象の職員の名前を添える', async () => {
    render(<Default />)
    const list = await screen.findByTestId('account-profile-policy-list')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.dataset.testid),
    ).toEqual([
      'account-profile-policy-schedule.self.edit',
      'account-profile-policy-schedule.user.read',
    ])
    expect(screen.getByTestId('account-profile-policy-schedule.self.edit')).toHaveTextContent(
      '自分の予定の編集',
    )
    expect(
      screen.getByTestId('account-profile-policy-targets-schedule.user.read'),
    ).toHaveTextContent('石川 二葉、上田 三奈')
    expect(screen.queryByTestId('account-profile-policy-targets-schedule.self.edit')).toBeNull()
  })

  it('職員の管理の権限を持つ職員には、自分の職員の詳細へのリンクを出す', async () => {
    render(<Manager />)
    expect(await screen.findByTestId('account-profile-staff-detail')).toHaveAttribute(
      'href',
      `/staff/${FAKE_VIEWER.staffId}`,
    )
  })

  it('カレンダーが結び付いていなければ、連携していないことと、連携を頼む相手を出す', async () => {
    render(<NotLinked />)
    expect(await screen.findByTestId('account-profile-calendar-not-linked')).toHaveTextContent(
      '連携していません。連携は、事業所の管理者に頼んでください。',
    )
    expect(screen.queryByTestId('account-profile-calendar-id')).toBeNull()
  })

  it('権限を 1 つも持たなければ、持っている権限が無いことを出す', async () => {
    render(<NoPolicies />)
    expect(await screen.findByTestId('account-profile-policies-empty')).toHaveTextContent(
      '持っている権限はありません。',
    )
  })

  it('読み込みに失敗すると失敗の文と読み直すを出す', async () => {
    render(<LoadError />)
    expect(await screen.findByTestId('account-profile-error')).toHaveTextContent(
      '自分の情報を読み込めませんでした。',
    )
    await userEvent.click(screen.getByTestId('account-profile-retry'))
    expect(await screen.findByTestId('account-profile-error')).toBeInTheDocument()
  })
})
