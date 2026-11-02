import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StatusBadge.stories'

const { Default, Muted, WithAvatar, WithDotLabel } = composeStories(stories)

describe('StatusBadge', () => {
  it('状態を文字で出す', () => {
    render(<Muted />)
    expect(screen.getByText('退職')).toBeVisible()
  })

  it('14px 以上の文字で出す', () => {
    render(<Default />)
    expect(parseFloat(getComputedStyle(screen.getByText('有効')).fontSize)).toBeGreaterThanOrEqual(
      14,
    )
  })
})

describe('Avatar', () => {
  it('名前の先頭の 1 文字を出し、読み上げない', () => {
    const { container } = render(<WithAvatar />)
    const avatars = container.querySelectorAll('[aria-hidden="true"]')
    expect([...avatars].map((a) => a.textContent)).toEqual(['青', '石', '上'])
  })
})

describe('DotLabel', () => {
  it('点を読み上げず、名前を並べる', () => {
    render(<WithDotLabel />)
    const label = screen.getByText('訪問チーム A')
    expect(label.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
