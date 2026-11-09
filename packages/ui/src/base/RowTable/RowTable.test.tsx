import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './RowTable.stories'

const { Selectable, WithHref, WithAction } = composeStories(stories)

const centerOf = (element: Element) => {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

describe('RowTable', () => {
  it('onSelect の行は、補足の値のセルを押しても onSelect を呼ぶ', async () => {
    const onSelect = fn()
    render(<Selectable onSelect={onSelect} />)
    const cell = within(screen.getByTestId('row-青木 一郎')).getByText('石井 花子')
    const { x, y } = centerOf(cell)
    const button = screen.getByRole('button', { name: '青木 一郎' })
    // 名前のボタンが、行の全体に押せる領域を広げている
    expect(document.elementFromPoint(x, y)).toBe(button)

    // 押した位置の要素がセルではなくボタンになるので、force で押す
    await userEvent.click(cell, { force: true })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('青木 一郎')
  })

  it('href の行は、補足の値のセルの上もリンクが覆う', () => {
    render(<WithHref />)
    const cell = screen.getByText('staff-a@example.com')
    const { x, y } = centerOf(cell)
    const link = screen.getByRole('link', { name: '石井 花子' })
    expect(link).toHaveAttribute('href', '#ishii')
    expect(document.elementFromPoint(x, y)).toBe(link)
  })

  it('行の操作を置いた行は、セルを押しても何もせず、操作のボタンは押せる', async () => {
    const onSelect = fn()
    render(<WithAction onSelect={onSelect} />)
    const cell = screen.getByText('staff-a@example.com')
    const { x, y } = centerOf(cell)
    expect(document.elementFromPoint(x, y)).toBe(cell)

    await userEvent.click(cell)
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '結び付ける' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('石井 花子')
  })

  it('値が null の補足は、見える値を出さず、読み上げだけで emptyLabel を伝える', () => {
    render(<WithAction />)
    const label = screen.getByText('まだ取り込んでいません')
    expect(label).toHaveClass('sr-only')
  })

  it('行の操作のメニューを開くボタンは 44×44 px 以上を押せる', () => {
    render(<WithAction />)
    const rect = screen.getByRole('button', { name: '江藤 次郎の操作' }).getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
  })
})
