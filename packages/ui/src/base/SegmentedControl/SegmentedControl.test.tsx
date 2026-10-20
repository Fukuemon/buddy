import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './SegmentedControl.stories'

const { ThreeOptions } = composeStories(stories)

describe('SegmentedControl', () => {
  it('名前のあるラジオボタンの組として出し、選ばれている選択肢を checked にする', () => {
    render(<ThreeOptions />)
    expect(screen.getByRole('radiogroup', { name: '表示の単位' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: '月' })).toBeChecked()
  })

  it('Tab で選ばれている選択肢に移り、矢印キーで選び直す', async () => {
    const onChange = fn()
    render(<ThreeOptions onChange={onChange} />)

    await userEvent.tab()
    expect(screen.getByRole('radio', { name: '月' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '週' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '週' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: '日' })).toBeChecked()
    expect(onChange.mock.calls.map(([id]) => id)).toEqual(['week', 'month', 'day'])
  })

  it('選択肢を押すと onChange を呼ぶ。選択肢は 44px 以上の高さで押せる', async () => {
    const onChange = fn()
    render(<ThreeOptions onChange={onChange} />)
    const week = screen.getByText('週')
    expect(week.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await userEvent.click(week)
    expect(onChange).toHaveBeenCalledWith('week')
  })
})
