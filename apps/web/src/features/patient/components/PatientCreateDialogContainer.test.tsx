import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './PatientCreateDialogContainer.stories'

const { Default, OptionsError, StaffStopped } = composeStories(stories)

const fill = async () => {
  await userEvent.type(await screen.findByTestId('patient-new-name'), '佐野 春香')
  await userEvent.selectOptions(await screen.findByTestId('patient-new-service'), 'code-i3')
  await userEvent.click(screen.getByTestId('patient-new-time-afternoon'))
  await userEvent.click(screen.getByTestId('patient-new-gender-male'))
  await userEvent.selectOptions(screen.getByTestId('patient-new-staff'), 'staff-2')
}

describe('PatientCreateDialogContainer', () => {
  it('開くと名前の欄にフォーカスを置き、選ぶ欄は何も選ばず、サービスは時間の範囲を添えて出す', async () => {
    render(<Default />)
    expect(await screen.findByTestId('patient-new-name')).toHaveFocus()
    const service = await screen.findByTestId('patient-new-service')
    expect(service).toHaveDisplayValue('選んでください')
    expect(within(service).getByRole('option', { name: '訪看I2（20〜29 分）' })).toBeInTheDocument()
    expect(screen.getByTestId('patient-new-time-morning')).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: '担当の職員' })).toHaveAccessibleDescription(
      '休職と退職の職員は選べません。',
    )
  })

  it('何も入れずに登録を押すと、送らずに欄ごとの誤りを出し、直した欄の誤りだけを消す', async () => {
    render(<Default />)
    await screen.findByTestId('patient-new-name')
    await userEvent.click(screen.getByTestId('patient-new-submit'))
    expect(screen.getByTestId('patient-new-error-name')).toHaveTextContent('名前を入れてください')
    expect(screen.getByTestId('patient-new-error-service')).toHaveTextContent(
      'サービスを選んでください',
    )
    expect(screen.getByTestId('patient-new-error-time')).toHaveTextContent(
      '希望の時間帯を選んでください',
    )
    expect(screen.getByTestId('patient-new-error-gender')).toHaveTextContent(
      '希望する担当の性別を選んでください',
    )
    expect(screen.getByTestId('patient-new-error-staff')).toHaveTextContent(
      '担当の職員を選んでください',
    )
    await userEvent.click(screen.getByTestId('patient-new-time-morning'))
    expect(screen.queryByTestId('patient-new-error-time')).toBeNull()
    expect(screen.getByTestId('patient-new-error-name')).toBeInTheDocument()
  })

  it('登録できたら、ダイアログを閉じる', async () => {
    render(<Default />)
    await fill()
    await userEvent.click(screen.getByTestId('patient-new-submit'))
    await expect.poll(() => screen.queryByTestId('patient-new-dialog')).toBeNull()
  })

  it('選んだ担当の職員が休職になって拒まれたら、ダイアログを閉じずに理由を出し、入れた値を残す', async () => {
    render(<StaffStopped />)
    await fill()
    await userEvent.click(screen.getByTestId('patient-new-submit'))
    expect(await screen.findByTestId('patient-new-submit-error')).toHaveTextContent(
      '選んだ担当の職員は、休職か退職になりました。別の職員を選んでください。',
    )
    expect(screen.getByTestId('patient-new-name')).toHaveValue('佐野 春香')
  })

  it('選択肢を読めなければ、登録を押せず、開き直すよう伝える', async () => {
    render(<OptionsError />)
    expect(await screen.findByTestId('patient-new-submit-error')).toHaveTextContent(
      'サービスと職員を読み込めませんでした。閉じてから、開き直してください。',
    )
    expect(screen.getByTestId('patient-new-submit')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('patient-new-service')).toBeDisabled()
  })
})
