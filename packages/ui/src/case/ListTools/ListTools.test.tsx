import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import { ListEmpty } from './ListTools'
import * as stories from './ListTools.stories'

const { Default, Filtered } = composeStories(stories)

describe('FilterSelect', () => {
  it('選択肢を「名前: 値」の形で出し、選び直すと値を変える', async () => {
    render(<Default />)
    const select = screen.getByRole('combobox', { name: '部署' })
    expect(select).toHaveDisplayValue('部署: すべて')
    await userEvent.selectOptions(select, '部署: 看護部')
    expect(select).toHaveDisplayValue('部署: 看護部')
  })

  it('値を選んだ絞り込みを太字にし、44px 以上の高さで押せる', () => {
    render(<Filtered />)
    const select = screen.getByRole('combobox', { name: '部署' })
    expect(select).toHaveClass('font-bold')
    expect(select.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    expect(screen.getByRole('combobox', { name: '役職' })).not.toHaveClass('font-bold')
  })
})

describe('ListCount', () => {
  it('件数の変化を読み上げる', () => {
    render(<Default />)
    expect(screen.getByText('12 人')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('ListEmpty', () => {
  it('知らせを出し、ボタンで絞り込みを外す', async () => {
    const onClear = fn()
    render(
      <ListEmpty
        clearLabel="絞り込みを外す"
        message="条件に合う職員がいません"
        onClear={onClear}
      />,
    )
    expect(screen.getByText('条件に合う職員がいません')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '絞り込みを外す' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
