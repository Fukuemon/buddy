import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './Modal.stories'

const { Default, Closed, WithOpener, WithHeaderContent, WithCancel } = composeStories(stories)

describe('Modal', () => {
  it('モーダルのダイアログとして開き、タイトルにフォーカスを移す', () => {
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

  it('関数の stickyFooter のキャンセルは、閉じるボタンと同じく、変更を破棄するかを確認してから閉じる', async () => {
    const onCloseRequest = fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<WithCancel onCloseRequest={onCloseRequest} />)
    const cancel = screen.getByRole('button', { name: 'キャンセル' })
    await userEvent.click(cancel)
    expect(onCloseRequest).not.toHaveBeenCalled()
    await userEvent.click(cancel)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(onCloseRequest).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('中身を押しても onCloseRequest を呼ばない', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)
    await userEvent.click(screen.getByText('モーダルの本文。'))
    expect(onCloseRequest).not.toHaveBeenCalled()
  })

  it('止められない cancel と続く close では、onCloseRequest を 1 回だけ呼ぶ', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)
    const dialog = screen.getByRole<HTMLDialogElement>('dialog')
    const closed = new Promise((resolve) =>
      dialog.addEventListener('close', resolve, { once: true }),
    )
    dialog.dispatchEvent(new Event('cancel', { cancelable: false }))
    dialog.close()
    await closed
    expect(onCloseRequest).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveProperty('open', true)
  })

  it('中身で押して背景で離しても、onCloseRequest を呼ばない', () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)
    const dialog = screen.getByRole('dialog')
    screen
      .getByText('モーダルの本文。')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onCloseRequest).not.toHaveBeenCalled()
  })

  it('Tab と Shift+Tab は、ダイアログの中だけを回る', async () => {
    render(<WithOpener />)
    await userEvent.click(screen.getByRole('button', { name: '予定を開く' }))
    const close = screen.getByRole('button', { name: '閉じる' })
    const edit = screen.getByRole('button', { name: '編集' })

    // 開いた直後はタイトルにフォーカスがあり、タイトルの後ろから順に移る
    await userEvent.tab()
    expect(close).toHaveFocus()
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

  it('タイトルを左に、閉じるボタンを右端に置き、headerContent をその間の右に寄せる', () => {
    render(<WithHeaderContent />)
    const close = screen.getByRole('button', { name: '閉じる' }).getBoundingClientRect()
    const title = screen.getByRole('heading', { name: '予定の詳細' }).getBoundingClientRect()
    const content = screen.getByRole('button', { name: '切り替え' }).getBoundingClientRect()
    const dialog = screen.getByRole('dialog').getBoundingClientRect()

    expect(content.left).toBeGreaterThan(title.right)
    expect(close.left).toBeGreaterThan(content.right)
    expect(close.left - content.right).toBeLessThanOrEqual(16)
    // ヘッダーの右の余白（pr-3、12px）の分だけ、ダイアログの右端から離れる
    expect(Math.round(dialog.right - close.right)).toBe(12)
  })

  it('isOpen が false なら何も出さない', () => {
    render(<Closed />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
