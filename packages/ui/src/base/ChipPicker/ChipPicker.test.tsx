import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './ChipPicker.stories'

const { AllSelected, Default } = composeStories(stories)

describe('ChipPicker', () => {
  it('選んでいるものだけをチップで並べ、選んでいないものを名前の順に候補に出す', async () => {
    render(<Default />)
    expect(screen.getByRole('list', { name: '対象の職員' })).toHaveTextContent('青木 一郎')
    await userEvent.click(screen.getByRole('textbox', { name: '対象の職員を選ぶ' }))
    const candidates = screen.getByRole('list', { name: '対象の職員の候補' })
    const names = [...candidates.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ja')))
    expect(names).toHaveLength(2)
    expect(names).not.toContain('青木 一郎')
  })

  it('下の矢印キーで候補に移り、Enter で足して足す欄にフォーカスを戻す', async () => {
    const onChange = fn()
    render(<Default onChange={onChange} />)
    await userEvent.click(screen.getByRole('textbox', { name: '対象の職員を選ぶ' }))
    await userEvent.keyboard('{ArrowDown}')
    const [first, second] = screen
      .getByRole('list', { name: '対象の職員の候補' })
      .querySelectorAll('button')
    expect(first).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(second).toHaveFocus()
    const secondId = second?.dataset.testid?.replace('staff-picker-option-', '')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['s1', secondId])
    expect(screen.getByRole('textbox', { name: '対象の職員を選ぶ' })).toHaveFocus()
  })

  it('候補を読み終えるまでは、足す欄を押せず、チップの × は押せる', async () => {
    render(<Default options={undefined} />)
    expect(screen.getByRole('textbox', { name: '対象の職員を選ぶ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 's1 を外す' })).toBeEnabled()
  })

  it('× で外すと、次のチップの × にフォーカスを移す', async () => {
    const onChange = fn()
    render(<AllSelected onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '青木 一郎 を外す' }))
    expect(onChange).toHaveBeenLastCalledWith(['s2', 's3'])
    expect(screen.getByRole('button', { name: '石川 花子 を外す' })).toHaveFocus()
  })

  it('Escape で候補を閉じる', async () => {
    render(<Default />)
    await userEvent.click(screen.getByRole('textbox', { name: '対象の職員を選ぶ' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('list', { name: '対象の職員の候補' })).not.toBeInTheDocument()
  })

  it('× と足す欄は 44px 以上の高さで押せる', () => {
    render(<Default />)
    const remove = screen.getByRole('button', { name: '青木 一郎 を外す' })
    expect(remove.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    const input = screen.getByRole('textbox', { name: '対象の職員を選ぶ' })
    expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
