import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './Button.stories'

const { Primary, PrimaryDisabled, Loading, Small, Danger } = composeStories(stories)

describe('Button', () => {
  it('押すと onClick を呼ぶ。Enter と Space でも押せる', async () => {
    const onClick = fn()
    render(<Primary onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('無効のときは aria-disabled を付け、フォーカスを受けるが onClick を呼ばない', async () => {
    const onClick = fn()
    render(<PrimaryDisabled onClick={onClick} />)
    const button = screen.getByRole('button', { name: '保存' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()

    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    // Playwright は aria-disabled の要素を押せないものとして待つので、force で押す
    await userEvent.click(button, { force: true })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('無効の送信のボタンは、フォームを送らない', async () => {
    const onSubmit = fn((event: SubmitEvent) => event.preventDefault())
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <PrimaryDisabled type="submit" />
      </form>,
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }), { force: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('読み込み中は名前を残したまま onClick を呼ばない', async () => {
    const onClick = fn()
    render(<Loading onClick={onClick} />)
    const button = screen.getByRole('button', { name: '保存' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('確定の削除のボタンは、赤い面に反転の文字で出す', () => {
    render(<Danger />)
    const button = screen.getByRole('button', { name: '外す' })
    expect(button).toHaveClass('bg-danger', 'text-text-inverse')
  })

  it('S のボタンは、見た目の外まで 44×44 px 以上を押せる', () => {
    render(
      <div className="p-4">
        <Small />
      </div>,
    )
    const button = screen.getByRole('button', { name: '保存' })
    const rect = button.getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    // 見た目の上端と下端の 1px 外側を押しても、ボタンに当たる
    const centerX = rect.left + rect.width / 2
    expect(document.elementFromPoint(centerX, rect.top - 1)).toBe(button)
    expect(document.elementFromPoint(centerX, rect.bottom + 1)).toBe(button)
  })
})
