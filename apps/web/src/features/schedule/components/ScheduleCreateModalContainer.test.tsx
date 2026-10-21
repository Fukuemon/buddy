import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import * as stories from './ScheduleCreateModalContainer.stories'

const { Visit } = composeStories(stories)

describe('ScheduleCreateModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('日付を変えてから種類を切り替えて閉じると、破棄の確認を出す', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    fireEvent.change(await screen.findByTestId('schedule-form-date'), {
      target: { value: '2026-10-22' },
    })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    expect(screen.getByTestId('schedule-form-date')).toHaveValue('2026-10-22')
    await userEvent.click(screen.getByTestId('modal-close'))

    expect(confirm).toHaveBeenCalledOnce()
  })

  it('入力を変えずに種類を切り替えて閉じると、確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    await userEvent.click(await screen.findByTestId('schedule-kind-tab-normal'))
    await userEvent.click(screen.getByTestId('modal-close'))

    expect(confirm).not.toHaveBeenCalled()
  })
})
