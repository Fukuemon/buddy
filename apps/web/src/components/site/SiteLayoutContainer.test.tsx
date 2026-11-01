import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './SiteLayoutContainer.stories'

const { StaffManager, Staff, Member, Review, ReviewForbidden, Mobile } = composeStories(stories)

const navLabels = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link', { hidden: true })
    .map((link) => link.textContent)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SiteLayoutContainer', () => {
  it('職員の管理の権限を持つ職員には、予定の下にカレンダー、取り込み、要確認、連携を、最後に職員を並べ、今の画面に印を付ける', async () => {
    stubViewport(true)
    render(<StaffManager />)
    const nav = await screen.findByTestId('site-nav')
    expect(within(nav).getByRole('list', { name: '予定' })).toBeInTheDocument()
    expect(within(nav).getByRole('list', { name: '職員' })).toBeInTheDocument()
    expect(navLabels(nav)).toEqual(['カレンダー', '取り込み', '要確認', '連携', '照合', '職員'])
    expect(within(nav).getByRole('link', { name: '照合' })).toHaveAttribute('aria-current', 'page')
  })

  it('職員の管理の権限を持たない職員には、予定の下にカレンダーだけを並べる', async () => {
    stubViewport(true)
    render(<Staff />)
    expect(navLabels(await screen.findByTestId('site-nav'))).toEqual(['カレンダー', '照合'])
  })

  it('照合の権限を持たない職員には、照合を並べない', async () => {
    stubViewport(true)
    render(<Member />)
    const nav = await screen.findByTestId('site-nav')
    expect(navLabels(nav)).toEqual(['カレンダー'])
    expect(within(nav).queryByRole('list', { name: '照合' })).not.toBeInTheDocument()
  })

  it('予定の中の画面では、カレンダーではなくその画面の項目に印を付ける', async () => {
    stubViewport(true)
    render(<Review />)
    const nav = await screen.findByTestId('site-nav')
    expect(within(nav).getByRole('link', { name: '要確認' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'カレンダー' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('権限が無くて出していない画面では、カレンダーにも印を付けない', async () => {
    stubViewport(true)
    render(<ReviewForbidden />)
    const nav = await screen.findByTestId('site-nav')
    expect(navLabels(nav)).toEqual(['カレンダー', '照合'])
    expect(within(nav).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
  })

  it('PC の幅では、ナビゲーションを開いた形で始め、メニューのボタンでレールにたたんで開く', async () => {
    stubViewport(true)
    render(<StaffManager />)
    const toggle = await screen.findByTestId('site-nav-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', screen.getByTestId('site-nav').id)

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('site-nav')).toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('スマートフォンの幅では、ナビゲーションを閉じたドロワーに入れ、メニューのボタンで開く', async () => {
    stubViewport(false)
    render(<Mobile />)
    const toggle = await screen.findByTestId('site-nav-toggle')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog')
    await userEvent.click(toggle)
    const drawer = screen.getByRole('dialog', { name: 'buddy' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(drawer).getByTestId('site-nav')).toBeInTheDocument()
  })
})
