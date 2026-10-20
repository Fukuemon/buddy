import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './Modal.stories'

const { Default, Closed, WithOpener } = composeStories(stories)

describe('Modal', () => {
  it('モーダルのダイアログとして開き、題にフォーカスを移す', () => {
    render(<Default />)
    const dialog = screen.getByRole('dialog', { name: '予定の詳細' })
    expect(dialog).toHaveProperty('open', true)
    expect(dialog.matches(':modal')).toBe(true)
    expect(screen.getByRole('heading', { name: '予定の詳細' })).toHaveFocus()
  })

  it('閉じるボタン、背景、Escape で onCloseRequest を呼ぶ', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    // 幅の狭い画面では、dialog の上端の外側に背景（::backdrop）が見えている
    await userEvent.click(screen.getByRole('dialog'), { position: { x: 20, y: -4 }, force: true })
    await userEvent.keyboard('{Escape}')
    expect(onCloseRequest).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('dialog')).toHaveProperty('open', true)
  })

  it('中身を押しても onCloseRequest を呼ばない', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)
    await userEvent.click(screen.getByText('モーダルの本文。'))
    expect(onCloseRequest).not.toHaveBeenCalled()
  })

  it('Tab と Shift+Tab は、ダイアログの中だけを回る', async () => {
    render(<WithOpener />)
    await userEvent.click(screen.getByRole('button', { name: '予定を開く' }))
    const close = screen.getByRole('button', { name: '閉じる' })
    const edit = screen.getByRole('button', { name: '編集' })

    // 開いた直後は題にフォーカスがあり、題の後ろから順に移る
    await userEvent.tab()
    expect(edit).toHaveFocus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(edit).toHaveFocus()
  })

  it('閉じると、開いたボタンへフォーカスを戻す', async () => {
    render(<WithOpener />)
    const opener = screen.getByRole('button', { name: '予定を開く' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('変更があるときは、確認で取り消すと閉じない', async () => {
    const onCloseRequest = fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Default isDirty onCloseRequest={onCloseRequest} />)

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(confirm).toHaveBeenCalled()
    expect(onCloseRequest).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('閉じるボタンは 44×44 px 以上を押せる', () => {
    render(<Default />)
    const rect = screen.getByRole('button', { name: '閉じる' }).getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
  })

  it('isOpen が false なら何も出さない', () => {
    render(<Closed />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
