import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './Loading.stories'

const { WithDescription } = composeStories(stories)

describe('Loading', () => {
  it('待ちを status の役割と aria-live で伝え、文を読み上げの対象にする', () => {
    render(<WithDescription />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('カレンダーを表示中...')
  })
})
