import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import type { ActionMenuItem } from './ActionMenu'
import * as stories from './ActionMenu.stories'

const { Default } = composeStories(stories)

const itemsOf = (onImport = fn(), onRemove = fn(), isImportDisabled = false): ActionMenuItem[] => [
  { label: '外す', onSelect: onRemove, 'data-testid': 'remove', isDanger: true },
  { label: '取り込む', onSelect: onImport, 'data-testid': 'import', disabled: isImportDisabled },
]

const openButton = () => screen.getByRole('button', { name: '青木 一郎の操作' })

describe('ActionMenu', () => {
  it('押すとメニューを開き、最初の項目にフォーカスを移す', async () => {
    render(<Default />)
    expect(openButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(openButton())
    expect(openButton()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: '青木 一郎の操作' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '取り込む' })).toHaveFocus()
  })

  it('isDanger の項目は、渡した順にかかわらず最後に置く', async () => {
    render(<Default />)
    await userEvent.click(openButton())
    const names = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(names).toEqual(['取り込む', '外す'])
  })

  it('Escape で閉じ、フォーカスを開くボタンに戻す', async () => {
    render(<Default />)
    await userEvent.click(openButton())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(openButton()).toHaveFocus()
  })

  it('メニューの外を押すと閉じる', async () => {
    render(
      <>
        <button type="button">外のボタン</button>
        <Default />
      </>,
    )
    await userEvent.click(openButton())
    await userEvent.click(screen.getByRole('button', { name: '外のボタン' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('もう一度押すと閉じる', async () => {
    render(<Default />)
    await userEvent.click(openButton())
    await userEvent.click(openButton())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('項目を選ぶと onSelect を呼び、メニューを閉じる', async () => {
    const onImport = fn()
    render(<Default items={itemsOf(onImport)} />)
    await userEvent.click(openButton())
    await userEvent.keyboard('{Enter}')
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('押せない項目は、選んでも onSelect を呼ばず、メニューを開いたままにする', async () => {
    const onImport = fn()
    render(<Default items={itemsOf(onImport, fn(), true)} />)
    await userEvent.click(openButton())
    const item = screen.getByRole('menuitem', { name: '取り込む' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    // Playwright は aria-disabled の要素を押せないものとして待つので、force で押す
    await userEvent.click(item, { force: true })
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('開くボタンと項目は、44 px 以上の高さで押せる', async () => {
    render(<Default />)
    const button = openButton().getBoundingClientRect()
    expect(button.width).toBeGreaterThanOrEqual(44)
    expect(button.height).toBeGreaterThanOrEqual(44)
    await userEvent.click(openButton())
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
  })
})
