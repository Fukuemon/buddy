import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { mockServiceCodes } from '#/mocks/scheduleData'

import * as stories from './ScheduleCreateModalContainer.stories'

const { FromOnLeaveStaffSlot, FromSlot, GooglePrimary, SelfEditOnly, Visit, WithSuspendedStaff } =
  composeStories(stories)

describe('ScheduleCreateModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('日付を変えてから種類を切り替えて閉じると、破棄の確認を出す', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    fireEvent.change(await screen.findByTestId('schedule-form-date'), {
      target: { value: '2000-01-01' },
    })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    expect(screen.getByTestId('schedule-form-date')).toHaveValue('2000-01-01')
    await userEvent.click(screen.getByTestId('modal-close'))

    expect(confirm).toHaveBeenCalledOnce()
  })

  it('開始時間を変えてから通常に切り替えると、終了時間を新しい開始時間の 1 時間後にする', async () => {
    render(<Visit />)

    fireEvent.change(await screen.findByTestId('schedule-form-start-time'), {
      target: { value: '13:00' },
    })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))

    expect(screen.getByTestId('schedule-form-end-time')).toHaveValue('14:00')
  })

  it('変えた日付を元に戻してから種類を切り替えて閉じると、確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    const date = await screen.findByTestId('schedule-form-date')
    const opened = (date as HTMLInputElement).value
    fireEvent.change(date, { target: { value: '2000-01-01' } })
    fireEvent.change(date, { target: { value: opened } })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    await userEvent.click(screen.getByTestId('modal-close'))

    expect(confirm).not.toHaveBeenCalled()
  })

  it('入力を変えずに種類を切り替えて閉じると、確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    await userEvent.click(await screen.findByTestId('schedule-kind-tab-normal'))
    await userEvent.click(screen.getByTestId('modal-close'))

    expect(confirm).not.toHaveBeenCalled()
  })

  it('自分の予定だけを編集できる職員には、主訪問者の候補に自分だけを出す', async () => {
    render(<SelfEditOnly />)

    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })

  it('サービスコードを、予定の API の一覧の順に並べる', async () => {
    render(<Visit />)

    const codes = (await screen.findAllByRole('radio', { name: /^(訪看|予防看|医)/ })).map(
      (radio) => radio.getAttribute('value'),
    )
    expect(codes).toEqual(mockServiceCodes.map((code) => code.code))
  })

  it('止めた職員がいる事業所では、主訪問者の候補に止めた職員を出さない', async () => {
    render(<WithSuspendedStaff />)

    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })

  it('URL の staffId が休職の職員を指すときは、主訪問者を未選択で開く', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<FromOnLeaveStaffSlot />)

    // 職員の一覧を取り終えるまで、主訪問者は値に関わらず未選択に見えるので、候補が出てから確認する
    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    await screen.findByTestId('staff-select-option-staff-1')
    await waitFor(() =>
      expect(screen.getByTestId('schedule-field-staff')).toHaveTextContent('選んでください'),
    )
    await userEvent.click(screen.getByTestId('modal-close'))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('URL の staffId が有効な職員を指すときは、その職員を選んで開く', async () => {
    render(<FromSlot />)

    await waitFor(() =>
      expect(screen.getByTestId('schedule-field-staff')).toHaveTextContent('石川 二葉'),
    )
  })

  it('google_primary の事業所では、フォームの代わりに Google カレンダーで作る案内を出す', async () => {
    render(<GooglePrimary />)
    expect(await screen.findByTestId('schedule-new-google-primary')).toHaveTextContent(
      'この事業所の予定は Google カレンダーで管理しています。',
    )
    expect(screen.queryByTestId('schedule-create-submit')).not.toBeInTheDocument()
  })
})
