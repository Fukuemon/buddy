import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './MonthPicker.stories'

const { Default, WithError } = composeStories(stories)

describe('MonthPicker', () => {
  it('見出しを欄に結び付け、月の値と補足の文を持つ', () => {
    render(<Default />)
    const input = screen.getByLabelText('対象の月')
    expect(input).toHaveAttribute('type', 'month')
    expect(input).toHaveValue('2026-11')
    expect(input).toHaveAccessibleDescription('その月の 1 日から月末までを対象にします。')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('誤りがあれば aria-invalid を付け、誤りの文を欄に結び付ける', () => {
    render(<WithError />)
    const input = screen.getByLabelText('対象の月')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('対象の月を選んでください')
  })

  it('欄は 44 px 以上の高さで描く', () => {
    render(<Default />)
    expect(screen.getByLabelText('対象の月').getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44,
    )
  })
})
