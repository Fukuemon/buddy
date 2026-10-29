import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './SiteLayoutContainer.stories'

const { StaffManager, Review, Mobile } = composeStories(stories)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SiteLayoutContainer', () => {
  it('照合の画面では、ヘッダーに「照合」の名前を出し、左の欄とメニューのボタンを出さない', async () => {
    stubViewport(true)
    render(<StaffManager />)
    expect(await screen.findByTestId('site-title')).toHaveTextContent('照合')
    expect(screen.queryByTestId('site-sidebar-open')).not.toBeInTheDocument()
  })

  it('予定の中の画面では、ヘッダーに「予定」の名前を出す', async () => {
    stubViewport(true)
    render(<Review />)
    expect(await screen.findByTestId('site-title')).toHaveTextContent('予定')
  })

  it('アプリのボタンのメニューに予定と照合を並べ、今の機能に印を付ける', async () => {
    stubViewport(false)
    render(<Mobile />)
    await userEvent.click(await screen.findByTestId('site-apps-open'))
    const nav = screen.getByTestId('site-nav')
    expect(
      within(nav)
        .getAllByRole('link', { hidden: true })
        .map((link) => link.textContent),
    ).toEqual(['予定', '照合'])
    expect(within(nav).getByRole('link', { name: '照合', hidden: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
