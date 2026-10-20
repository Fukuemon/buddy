import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './SearchBox.stories'

const { Default, WithValue } = composeStories(stories)

describe('SearchBox', () => {
  it('aria-label を名前に持つ検索欄で、入力のたびに onSearch を呼ぶ', async () => {
    const onSearch = fn()
    render(<Default onSearch={onSearch} />)
    const input = screen.getByRole('searchbox', { name: '職員を検索' })
    await userEvent.type(input, '上田')
    expect(onSearch).toHaveBeenLastCalledWith('上田')
  })

  it('Escape で語を消し、空の語で onSearch を呼ぶ', async () => {
    const onSearch = fn()
    render(<WithValue onSearch={onSearch} />)
    await userEvent.tab()
    expect(screen.getByRole('searchbox')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(onSearch).toHaveBeenLastCalledWith('')
  })

  it('44px 以上の高さで押せる', () => {
    render(<Default />)
    const label = screen.getByRole('searchbox').closest('label')
    expect(label?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
