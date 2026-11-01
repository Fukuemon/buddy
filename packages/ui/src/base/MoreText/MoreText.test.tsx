import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './MoreText.stories'

const { Default, DefaultOpen } = composeStories(stories)

const toggle = () => screen.getByRole('button', { name: '詳しく' })
const body = () => screen.getByTestId('import-more-body')

describe('MoreText', () => {
  it('閉じた状態で始め、押すと続きの説明を開き、もう一度押すと閉じる', async () => {
    render(<Default />)
    expect(
      screen.getByText('Google カレンダーの予定を、職員ごとに buddy へ取り込みます。'),
    ).toBeVisible()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveAttribute('aria-controls', body().id)
    expect(body()).not.toBeVisible()

    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(body()).toBeVisible()

    await userEvent.keyboard('{Enter}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(body()).not.toBeVisible()
  })

  it('defaultOpen なら、開いた状態で始める', () => {
    render(<DefaultOpen />)
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(body()).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('「詳しく」のボタンは 44 px 以上の高さで押せる', () => {
    render(<Default />)
    expect(toggle().getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
