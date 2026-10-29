import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarHeaderTools.stories'

const { WithReview, NoReview, ManyReviews } = composeStories(stories)

describe('CalendarHeaderTools', () => {
  it('確認が必要な予定の件数を印で示し、読み上げる名前に件数を入れる', () => {
    render(<WithReview />)
    expect(screen.getByTestId('site-nav-review-count')).toHaveTextContent('3')
    expect(screen.getByTestId('site-nav-review')).toHaveAccessibleName('確認が必要な予定 3 件')
    expect(screen.getByTestId('site-nav-import')).toHaveAttribute('href', '/schedule/import')
  })

  it('0 件のときは、件数の印を出さない', () => {
    render(<NoReview />)
    expect(screen.queryByTestId('site-nav-review-count')).not.toBeInTheDocument()
    expect(screen.getByTestId('site-nav-review')).toHaveAccessibleName('確認が必要な予定')
  })

  it('100 件以上のときは、印を 99+ にする', () => {
    render(<ManyReviews />)
    expect(screen.getByTestId('site-nav-review-count')).toHaveTextContent('99+')
  })
})
