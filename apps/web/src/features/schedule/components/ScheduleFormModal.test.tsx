import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleFormModal.stories'

const { Visit, Normal, SubmitError } = composeStories(stories)

describe('ScheduleFormModal', () => {
  it('必須の項目が空なら送らず、項目の一覧にエラーを出す', async () => {
    const onSubmit = fn()
    render(<Visit onSubmit={onSubmit} />)

    await userEvent.click(screen.getByTestId('schedule-create-submit'))
    expect(
      await within(screen.getByTestId('schedule-field-patient')).findByText(
        '利用者を選んでください',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('schedule-field-staff')).getByText('主訪問者を選んでください'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('利用者と主訪問者を選ぶと、フォームの値で onSubmit を呼ぶ', async () => {
    const onSubmit = fn()
    render(<Visit onSubmit={onSubmit} />)

    await userEvent.click(screen.getByTestId('schedule-field-patient'))
    await userEvent.click(screen.getByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-field-staff'))
    await userEvent.type(screen.getByTestId('staff-select-search'), '上田')
    await userEvent.click(screen.getByTestId('staff-select-option-staff-3'))
    await userEvent.click(screen.getByTestId('schedule-create-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: 'visit',
      patientId: 'patient-2',
      staffId: 'staff-3',
      scheduleDate: '2026-10-20',
      startTime: '09:00',
      serviceTime: 29,
    })
  })

  it('入力を変えていなければ、キャンセルで確認を出さずに onClose を呼ぶ', async () => {
    const onClose = fn()
    render(<Visit onClose={onClose} />)
    await userEvent.click(screen.getByTestId('schedule-new-cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('利用者の候補に、利用の終了の利用者を出さない', async () => {
    render(<Visit />)

    await userEvent.click(screen.getByTestId('schedule-field-patient'))
    expect(screen.getByTestId('patient-select-option-patient-1')).toBeInTheDocument()
    expect(screen.queryByTestId('patient-select-option-patient-ended')).not.toBeInTheDocument()
  })

  it('サービスコードを変えると、提供時間をそのコードの上限にする', async () => {
    render(<Visit />)
    await userEvent.click(screen.getByTestId('service-code-訪看I4'))
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(89)
    expect(screen.getByTestId('schedule-form-end-time')).toHaveTextContent('10:29')
  })

  it('提供時間の欄を空にすると、要約の終了時間と提供時間を「-」にする', async () => {
    render(<Visit />)
    await userEvent.clear(screen.getByTestId('schedule-form-service-time'))
    expect(screen.getByTestId('schedule-field-date-time')).toHaveTextContent(
      '2026-10-20 09:00 - -（- 分、訪看I2）',
    )
  })

  it('開始時間の欄を空にすると、要約と終了時間を「-」にする', async () => {
    render(<Visit />)
    await userEvent.clear(screen.getByTestId('schedule-form-start-time'))
    expect(screen.getByTestId('schedule-field-date-time')).toHaveTextContent(
      '2026-10-20 - -（29 分、訪看I2）',
    )
    expect(screen.getByTestId('schedule-form-end-time')).toHaveTextContent('終了時間 -')
  })

  it('訪問の予定の開始時間と提供時間の和が 24 時以上なら、終了時間を翌日と出す', async () => {
    render(<Visit />)
    await userEvent.click(screen.getByTestId('service-code-医'))
    await userEvent.clear(screen.getByTestId('schedule-form-start-time'))
    await userEvent.type(screen.getByTestId('schedule-form-start-time'), '23:00')
    expect(screen.getByTestId('schedule-form-end-time')).toHaveTextContent('終了時間 翌日 00:30')
    expect(screen.getByTestId('schedule-field-date-time')).toHaveTextContent(
      '2026-10-20 23:00 - 翌日 00:30（90 分、医）',
    )
  })

  it('通常の予定の 22:00 から 1:00 は、翌日を選ばなければ送らず、選ぶと翌日の印を付けて送る', async () => {
    const onSubmit = fn()
    render(<Normal onSubmit={onSubmit} />)
    await userEvent.click(screen.getByTestId('schedule-field-title'))
    await userEvent.type(screen.getByTestId('schedule-form-title'), '夜勤')
    await userEvent.click(screen.getByTestId('schedule-field-staff'))
    await userEvent.click(screen.getByTestId('staff-select-option-staff-3'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))
    await userEvent.clear(screen.getByTestId('schedule-form-start-time'))
    await userEvent.type(screen.getByTestId('schedule-form-start-time'), '22:00')
    await userEvent.clear(screen.getByTestId('schedule-form-end-time'))
    await userEvent.type(screen.getByTestId('schedule-form-end-time'), '01:00')
    await userEvent.click(screen.getByTestId('schedule-create-submit'))

    expect(await screen.findAllByText('終了時間は開始時間より後にしてください')).not.toHaveLength(0)
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('schedule-form-ends-next-day'))
    await waitFor(() =>
      expect(screen.queryByText('終了時間は開始時間より後にしてください')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('schedule-field-date-time')).toHaveTextContent(
      '2026-10-20 22:00 - 翌日 01:00',
    )
    await userEvent.click(screen.getByTestId('schedule-create-submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: 'normal',
      startTime: '22:00',
      endTime: '01:00',
      endsNextDay: true,
    })
  })

  it('通常の予定はタイトルの項目を出し、訪問のタブを押すと onKindChange を呼ぶ', async () => {
    const onKindChange = fn()
    render(<Normal onKindChange={onKindChange} />)
    expect(screen.getByTestId('schedule-field-title')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-field-patient')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('schedule-kind-tab-visit'))
    expect(onKindChange).toHaveBeenCalledWith('visit')
  })

  it('ヘッダーには、タイトル、種類のタブ、閉じるボタンの順に並べる', () => {
    render(<Visit onKindChange={fn()} />)
    const close = screen.getByTestId('modal-close')
    const title = screen.getByRole('heading', { name: '予定の作成' })
    const kindTab = screen.getByTestId('schedule-kind-tab')

    expect(title.compareDocumentPosition(kindTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(kindTab.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('送信の失敗の文を出す', () => {
    render(<SubmitError />)
    expect(screen.getByText('予定を作成できませんでした。')).toBeInTheDocument()
  })
})
