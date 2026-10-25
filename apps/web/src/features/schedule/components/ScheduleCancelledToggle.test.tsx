import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import { ScheduleCancelledToggle } from './ScheduleCancelledToggle'

describe('ScheduleCancelledToggle', () => {
  it('切り替えを入れると、true を渡す', async () => {
    const onChange = fn()
    render(<ScheduleCancelledToggle checked={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'キャンセルした予定を出す' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
