import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarReviewBadge.stories'

const { WithReview, NoReview, ManyReviews } = composeStories(stories)

describe('CalendarReviewBadge', () => {
  it('確認が必要な予定の件数を印で示し、読み上げに件数を入れる', () => {
    const { container } = render(<WithReview />)
    expect(screen.getByTestId('site-nav-review-count')).toHaveTextContent('3')
    expect(container).toHaveTextContent('3 件')
  })

  it('0 件のときは、印を出さない', () => {
    const { container } = render(<NoReview />)
    expect(container).toBeEmptyDOMElement()
  })

  it('100 件以上のときは、印を 99+ にする', () => {
    render(<ManyReviews />)
    expect(screen.getByTestId('site-nav-review-count')).toHaveTextContent('99+')
  })
})
