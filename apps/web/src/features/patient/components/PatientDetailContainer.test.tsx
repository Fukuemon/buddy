import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './PatientDetailContainer.stories'

const { Default, Ended, Forbidden, NotFound, ServiceCodesOnceError, WithSchedules } =
  composeStories(stories)

const openMenuItem = async (testId: string) => {
  await userEvent.click(await screen.findByTestId('patient-detail-menu'))
  await userEvent.click(screen.getByTestId(testId))
}

describe('PatientDetailContainer', () => {
  it('利用中の利用者は、状態の印と利用の状態を出さず、サービスを時間の範囲とともに出す', async () => {
    render(<Default />)
    expect(await screen.findByTestId('patient-detail-name')).toHaveTextContent('小林 冬馬')
    expect(screen.queryByTestId('patient-detail-status')).toBeNull()
    const profile = screen.getByTestId('patient-detail-profile')
    expect(await within(profile).findByText('訪看I2（20〜29 分）')).toBeInTheDocument()
    expect(profile).toHaveTextContent('青木 一郎')
    expect(screen.queryByTestId('patient-detail-status-text')).toBeNull()
  })

  it('編集で名前とサービスと希望と担当を変えると、ダイアログを閉じて変えた値を出す', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('patient-detail-edit'))
    const dialog = screen.getByTestId('patient-detail-edit-dialog')
    const name = within(dialog).getByTestId('patient-detail-name-input')
    expect(name).toHaveFocus()
    await userEvent.clear(name)
    await userEvent.type(name, '小林 冬馬 改')
    await userEvent.selectOptions(
      await within(dialog).findByTestId('patient-detail-service-input'),
      'code-i3',
    )
    await userEvent.click(within(dialog).getByTestId('patient-detail-time-input-afternoon'))
    await userEvent.selectOptions(
      within(dialog).getByTestId('patient-detail-staff-input'),
      'staff-3',
    )
    await userEvent.click(within(dialog).getByTestId('patient-detail-save'))

    await expect.poll(() => screen.queryByTestId('patient-detail-edit-dialog')).toBeNull()
    expect(screen.getByTestId('patient-detail-name')).toHaveTextContent('小林 冬馬 改')
    const profile = screen.getByTestId('patient-detail-profile')
    expect(profile).toHaveTextContent('訪看I3（30〜59 分）')
    expect(profile).toHaveTextContent('午後')
    expect(profile).toHaveTextContent('上田 三奈')
  })

  it('名前を空にして保存すると、送らずに誤りを出す', async () => {
    render(<Default />)
    await userEvent.click(await screen.findByTestId('patient-detail-edit'))
    await userEvent.clear(screen.getByTestId('patient-detail-name-input'))
    await userEvent.click(screen.getByTestId('patient-detail-save'))
    expect(screen.getByTestId('patient-detail-error-name')).toHaveTextContent(
      '名前を入れてください',
    )
    expect(screen.getByTestId('patient-detail-edit-dialog')).toBeInTheDocument()
  })

  it('残る予定が無ければ利用の終了にでき、利用の終了の状態の印と利用の状態を出す', async () => {
    render(<Default />)
    await openMenuItem('patient-detail-end')
    const dialog = screen.getByTestId('patient-end-dialog')
    expect(await within(dialog).findByText('今日以降の予定は残っていません。')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('小林 冬馬 を利用の終了にしますか')
    await userEvent.click(within(dialog).getByTestId('patient-end-submit'))

    await expect.poll(() => screen.queryByTestId('patient-end-dialog')).toBeNull()
    expect(screen.getByTestId('patient-detail-status')).toHaveTextContent('利用の終了（')
    expect(screen.getByTestId('patient-detail-status-text')).toHaveTextContent(
      '予定の利用者に選べません。',
    )
  })

  it('今日以降の予定が残る利用者は、残る予定を予定の詳細へのリンクで出し、利用の終了にするを押せない', async () => {
    render(<WithSchedules />)
    await openMenuItem('patient-detail-end')
    const dialog = screen.getByTestId('patient-end-dialog')
    expect(await within(dialog).findByTestId('patient-end-schedule-schedule-1')).toHaveAttribute(
      'href',
      '/schedule/schedule-1',
    )
    expect(dialog).toHaveTextContent('加藤 春子 を利用の終了にできません')
    expect(within(dialog).getByTestId('patient-end-submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('利用の終了の利用者の編集では、休職の今の担当を選択肢の先頭に残す', async () => {
    render(<Ended />)
    await screen.findByText('石川 二葉（休職）')
    await userEvent.click(screen.getByTestId('patient-detail-edit'))
    const staff = screen.getByTestId('patient-detail-staff-input')
    expect(staff).toHaveDisplayValue('石川 二葉（休職。今の担当）')
    expect(within(staff).getAllByRole('option')[1]).toHaveTextContent('石川 二葉（休職。今の担当）')
  })

  it('利用の終了の利用者は、休職の担当に状態を添え、再開では担当を選び直すまで再開を押せない', async () => {
    render(<Ended />)
    expect(await screen.findByTestId('patient-detail-status')).toHaveTextContent(
      '利用の終了（2026/10/01）',
    )
    expect(await screen.findByText('石川 二葉（休職）')).toBeInTheDocument()
    await openMenuItem('patient-detail-resume')
    const dialog = screen.getByTestId('patient-resume-dialog')
    expect(within(dialog).getByTestId('patient-resume-staff-note')).toHaveTextContent(
      '今の担当の 石川 二葉 は休職しています。担当の職員を選んでください。',
    )
    const submit = within(dialog).getByTestId('patient-resume-submit')
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await userEvent.selectOptions(within(dialog).getByTestId('patient-resume-staff'), 'staff-3')
    await userEvent.click(submit)

    await expect.poll(() => screen.queryByTestId('patient-resume-dialog')).toBeNull()
    expect(screen.queryByTestId('patient-detail-status')).toBeNull()
    expect(screen.getByTestId('patient-detail-profile')).toHaveTextContent('上田 三奈')
  })

  it('サービスコードを読めなかった後に編集のダイアログを開くと、サービスコードを読み直して選べる', async () => {
    render(<ServiceCodesOnceError />)
    const profile = await screen.findByTestId('patient-detail-profile')
    expect(profile).toHaveTextContent('訪看I2')
    expect(profile).not.toHaveTextContent('訪看I2（20〜29 分）')
    await userEvent.click(screen.getByTestId('patient-detail-edit'))
    await expect.poll(() => screen.queryByTestId('patient-detail-edit-error')).toBeNull()
    expect(screen.getByTestId('patient-detail-service-input')).toBeEnabled()
  })

  it('利用者が見つからなければ、開き直すよう伝え、読み直すを出さない', async () => {
    render(<NotFound />)
    expect(await screen.findByTestId('patient-detail-error')).toHaveTextContent(
      '利用者が見つかりません。利用者の一覧から開き直してください。',
    )
    expect(screen.queryByTestId('patient-detail-retry')).toBeNull()
  })

  it('職員の管理の権限が無ければ、利用者を出さずに権限が無いことを示す', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('patient-detail-name')).toBeNull()
  })
})
