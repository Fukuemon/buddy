import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import * as stories from './ScheduleCreateModalContainer.stories'

const { Visit, WithSuspendedStaff } = composeStories(stories)

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

  it('止めた職員がいる事業所では、担当者の候補に止めた職員を出さない', async () => {
    render(<WithSuspendedStaff />)

    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })
})
