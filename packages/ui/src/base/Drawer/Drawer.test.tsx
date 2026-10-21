import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './Drawer.stories'

const { Default, Closed, WithOpener } = composeStories(stories)

describe('Drawer', () => {
  it('左端にモーダルのダイアログとして開き、題にフォーカスを移す', () => {
    render(<Default />)
    const dialog = screen.getByRole('dialog', { name: '絞り込み' })
    expect(dialog).toHaveProperty('open', true)
    expect(dialog.matches(':modal')).toBe(true)
    expect(dialog.getBoundingClientRect().left).toBe(0)
    expect(screen.getByRole('heading', { name: '絞り込み' })).toHaveFocus()
  })

  it('閉じるボタン、背景、Escape で onCloseRequest を呼ぶ', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    // ドロワーの右の外側に背景（::backdrop）が見えている
    const rect = screen.getByRole('dialog').getBoundingClientRect()
    await userEvent.click(screen.getByRole('dialog'), {
      position: { x: rect.width + 20, y: 20 },
      force: true,
    })
    await userEvent.keyboard('{Escape}')
    expect(onCloseRequest).toHaveBeenCalledTimes(3)
  })

  it('中身を押しても onCloseRequest を呼ばない', async () => {
    const onCloseRequest = fn()
    render(<Default onCloseRequest={onCloseRequest} />)
    await userEvent.click(screen.getByText('青木 一郎'))
    expect(onCloseRequest).not.toHaveBeenCalled()
  })

  it('開くボタンの aria-expanded と aria-controls が、ドロワーの開閉と id を指す', async () => {
    render(<WithOpener />)
    const opener = screen.getByRole('button', { name: '絞り込みを開く' })
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(opener.getAttribute('aria-controls') ?? '')).toBeInstanceOf(
      HTMLDialogElement,
    )

    await userEvent.click(opener)
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: '絞り込み' })).toHaveProperty('open', true)
  })

  it('Tab と Shift+Tab は、ドロワーの中だけを回る', async () => {
    render(<WithOpener />)
    await userEvent.click(screen.getByRole('button', { name: '絞り込みを開く' }))
    const close = screen.getByRole('button', { name: '閉じる' })
    const last = screen.getByRole('checkbox', { name: '石井 花子' })

    // 開いた直後は題にフォーカスがあり、題の後ろから順に移る
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(last).toHaveFocus()
    await userEvent.tab()
    expect(close).toHaveFocus()
  })

  it('Escape で閉じると、開いたボタンへフォーカスを戻す', async () => {
    render(<WithOpener />)
    const opener = screen.getByRole('button', { name: '絞り込みを開く' })
    await userEvent.click(opener)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(opener).toHaveAttribute('aria-expanded', 'false')
  })

  it('閉じるボタンは 44×44 px 以上を押せる', () => {
    render(<Default />)
    const rect = screen.getByRole('button', { name: '閉じる' }).getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
  })

  it('閉じている間は、ダイアログを支援技術に見せない', () => {
    render(<Closed />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
