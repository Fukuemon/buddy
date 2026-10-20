import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it, vi } from 'vite-plus/test'

import * as stories from './Modal.stories'

const { Default, Closed } = composeStories(stories)

describe('Modal', () => {
  it('閉じるボタン、背景、Escape で onCloseRequest を呼ぶ', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)
    expect(screen.getByRole('dialog', { name: '予定の詳細' })).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('modal-close'))
    await userEvent.click(screen.getByTestId('modal-overlay'))
    await userEvent.keyboard('{Escape}')
    expect(onCloseRequest).toHaveBeenCalledTimes(3)
  })

  it('変更があるときは、確認で取り消すと閉じない', async () => {
    const onCloseRequest = fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Default isDirty onCloseRequest={onCloseRequest} />)

    await userEvent.click(screen.getByTestId('modal-close'))
    expect(confirm).toHaveBeenCalled()
    expect(onCloseRequest).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('isOpen が false なら何も出さない', () => {
    render(<Closed />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
