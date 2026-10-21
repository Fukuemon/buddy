import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './SiteHeaderContainer.stories'

const { StaffManager, Staff } = composeStories(stories)

describe('SiteHeaderContainer', () => {
  it('職員の管理の権限を持つ職員には、取り込みと要確認のリンクを出す', async () => {
    render(<StaffManager />)
    const nav = await screen.findByTestId('site-nav')
    expect(within(nav).getByRole('link', { name: '取り込み' })).toHaveAttribute(
      'href',
      '/schedule/import',
    )
    expect(within(nav).getByRole('link', { name: '要確認' })).toHaveAttribute(
      'href',
      '/schedule/review',
    )
  })

  it('職員の管理の権限を持たない職員には、取り込みと要確認のリンクを出さない', async () => {
    render(<Staff />)
    const nav = await screen.findByTestId('site-nav')
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['予定', '照合'])
  })
})
