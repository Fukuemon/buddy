import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffDetailContainer.stories'

const { Default, Forbidden, NoAssignments, NotFound, OnLeave, Retired, Self } =
  composeStories(stories)

const openPolicies = async () => {
  await userEvent.click(await screen.findByTestId('staff-detail-tab-policies'))
  await userEvent.click(await screen.findByTestId('staff-detail-policies-change'))
  return screen.getByTestId('staff-policies-dialog')
}

describe('StaffDetailContainer', () => {
  it('プロフィールに電話番号、部署、チーム、役職、在籍を出し、編集で名前とチームを変えると出し直す', async () => {
    render(<Default />)
    expect(await screen.findByTestId('staff-detail-status-text')).toHaveTextContent(
      '有効です。ログインして、予定を使えます。',
    )
    await userEvent.click(screen.getByTestId('staff-detail-edit'))
    const dialog = screen.getByTestId('staff-detail-edit-dialog')
    const name = within(dialog).getByTestId('staff-detail-name-input')
    expect(name).toHaveFocus()
    await userEvent.clear(name)
    await userEvent.type(name, '石川 双葉')
    await userEvent.selectOptions(
      await within(dialog).findByTestId('staff-detail-team-input'),
      'B チーム',
    )
    await userEvent.click(within(dialog).getByTestId('staff-detail-save'))

    expect(await screen.findByTestId('staff-detail-name')).toHaveTextContent('石川 双葉')
    expect(screen.queryByTestId('staff-detail-edit-dialog')).toBeNull()
    await userEvent.click(screen.getByTestId('staff-detail-tab-policies'))
    expect(await screen.findByTestId('staff-policy-row-schedule.team.read')).toHaveTextContent(
      'B チーム',
    )
  })

  it('権限のタブに 8 つの権限を、付いているかと付いた理由とともに並べ、職員の管理を最後に置く', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('staff-detail-tab-policies'))
    const rows = within(await screen.findByTestId('staff-policy-table')).getAllByRole('row')
    expect(rows).toHaveLength(9)
    expect(rows.at(-1)).toHaveTextContent('職員の管理— 付いていない')
    expect(screen.getByTestId('staff-policy-row-schedule.self.edit')).toHaveTextContent(
      '✓ 付いている役職で付く',
    )
  })

  it('権限を変えるで、対象の職員を選んで足すと、個別に足した権限と対象の名前を出す', async () => {
    render(<Default />)
    const dialog = await openPolicies()
    const submit = within(dialog).getByTestId('staff-policies-submit')
    await userEvent.click(within(dialog).getByTestId('staff-policies-option-schedule.user.read'))
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(within(dialog).getByTestId('staff-policies-target-staff-3'))
    await userEvent.click(submit)

    const row = await screen.findByTestId('staff-policy-row-schedule.user.read')
    await expect.poll(() => row.textContent).toContain('個別に足した')
    expect(row).toHaveTextContent('上田 三奈')
    expect(screen.queryByTestId('staff-policies-dialog')).toBeNull()
  })

  it('職員の管理の権限を持つ最後の有効な職員から外そうとすると、ほかの変更は残して理由を出す', async () => {
    render(<Self />)
    const dialog = await openPolicies()
    await userEvent.click(within(dialog).getByTestId('staff-policies-option-staff.manage'))
    await userEvent.click(within(dialog).getByTestId('staff-policies-option-schedule.all.read'))
    await userEvent.click(within(dialog).getByTestId('staff-policies-submit'))

    expect(await within(dialog).findByTestId('staff-policies-error')).toHaveTextContent(
      '次の権限を変えられませんでした。ほかの変更は保存しました。職員の管理: 職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
    )
    expect(within(dialog).getByTestId('staff-policies-option-staff.manage')).toBeChecked()
    expect(within(dialog).getByTestId('staff-policies-option-schedule.all.read')).toBeChecked()
  })

  it('役職を変えると、個別に足した権限が消えることを示してから、権限を新しい役職のものに置き換える', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('staff-detail-position-change'))
    const dialog = screen.getByTestId('staff-position-dialog')
    expect(within(dialog).getByTestId('staff-position-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(
      await within(dialog).findByTestId('staff-position-option-position-manager'),
    )
    await userEvent.click(within(dialog).getByTestId('staff-position-submit'))

    expect(await screen.findByTestId('staff-detail-position-name')).toHaveTextContent(
      'マネージャー',
    )
  })

  it('「…」の休職にするで残る予定を示し、休職にすると在籍を休職にする', async () => {
    render(<NoAssignments />)
    await userEvent.click(await screen.findByTestId('staff-detail-menu'))
    await userEvent.click(screen.getByTestId('staff-detail-leave'))
    const dialog = screen.getByTestId('staff-leave-dialog')
    expect(await within(dialog).findByTestId('staff-leave-assignments')).toHaveTextContent(
      '今日以降の予定と担当の利用者は残っていません。',
    )
    await userEvent.type(within(dialog).getByTestId('staff-leave-return-date'), '2027-04-01')
    await userEvent.click(within(dialog).getByTestId('staff-leave-submit'))

    expect(await screen.findByTestId('staff-detail-status')).toHaveTextContent(
      '休職（2027/04/01 に戻る予定）',
    )
  })

  it('予定が残る職員は、退職のダイアログで退職にできないことを示し、退職にするを押せない', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('staff-detail-menu'))
    await userEvent.click(screen.getByTestId('staff-detail-retire'))
    const dialog = screen.getByTestId('staff-retire-dialog')
    expect(await within(dialog).findByText('石川 二葉 を退職にできません')).toBeInTheDocument()
    expect(within(dialog).getByTestId('staff-retire-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('予定が残らない職員は退職にでき、退職した職員の表示にする', async () => {
    render(<NoAssignments />)
    await userEvent.click(await screen.findByTestId('staff-detail-menu'))
    await userEvent.click(screen.getByTestId('staff-detail-retire'))
    const dialog = screen.getByTestId('staff-retire-dialog')
    await within(dialog).findByText('石川 二葉 を退職にしますか')
    await userEvent.click(within(dialog).getByTestId('staff-retire-submit'))

    expect(await screen.findByTestId('staff-detail-email')).toHaveTextContent(
      'メールアドレスなし（退職で消しました）',
    )
    expect(screen.queryByTestId('staff-detail-edit')).toBeNull()
  })

  it('休職の職員は「…」の復職にするで有効に戻る', async () => {
    render(<OnLeave />)
    expect(await screen.findByTestId('staff-detail-status')).toHaveTextContent('休職')
    await userEvent.click(screen.getByTestId('staff-detail-menu'))
    await userEvent.click(screen.getByTestId('staff-detail-reinstate'))
    await expect.poll(() => screen.getByTestId('staff-detail-status').textContent).toBe('有効')
  })

  it('退職した職員と自分の詳細では、出さない操作がある', async () => {
    const { unmount } = render(<Retired />)
    expect(await screen.findByTestId('staff-detail-status')).toHaveTextContent('退職（2026/09/30）')
    expect(screen.queryByTestId('staff-detail-menu')).toBeNull()
    expect(screen.queryByTestId('staff-detail-position-change')).toBeNull()
    unmount()

    render(<Self />)
    expect(await screen.findByTestId('staff-detail-edit')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-detail-menu')).toBeNull()
  })

  it('見つからない職員は読み直すを出さず、権限が無ければ権限が無いことを示す', async () => {
    const { unmount } = render(<NotFound />)
    expect(await screen.findByTestId('staff-detail-error')).toHaveTextContent(
      '職員が見つかりませんでした。職員の一覧から開き直してください。',
    )
    expect(screen.queryByTestId('staff-detail-retry')).toBeNull()
    unmount()

    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument()
  })
})
