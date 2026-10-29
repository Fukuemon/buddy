import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './SiteLayoutContainer.stories'

const { StaffManager, ScheduleManager, Staff, Mobile } = composeStories(stories)

const linkLabels = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SiteLayoutContainer', () => {
  it('照合の画面では、ヘッダーに機能のタブを出して照合に印を付け、左の欄とメニューのボタンと予定の中のタブを出さない', async () => {
    stubViewport(true)
    render(<StaffManager />)
    const nav = await screen.findByTestId('site-nav')
    expect(linkLabels(nav)).toEqual(['予定', '照合'])
    expect(within(nav).getByRole('link', { name: '照合' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: '予定' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByTestId('site-sidebar-open')).not.toBeInTheDocument()
    expect(screen.queryByTestId('site-subnav')).not.toBeInTheDocument()
  })

  it('職員の管理の権限を持つ職員が予定の中の画面を開くと、予定のタブに印を付け、予定の中のタブを出す', async () => {
    stubViewport(true)
    render(<ScheduleManager />)
    const nav = await screen.findByTestId('site-nav')
    expect(within(nav).getByRole('link', { name: '予定' })).toHaveAttribute('aria-current', 'page')
    const subnav = screen.getByTestId('site-subnav')
    expect(linkLabels(subnav)).toEqual(['カレンダー', '取り込み', '要確認'])
    expect(within(subnav).getByRole('link', { name: '取り込み' })).toHaveAttribute(
      'href',
      '/schedule/import',
    )
    expect(within(subnav).getByRole('link', { name: '要確認' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('職員の管理の権限を持たない職員には、予定の中のタブを出さない', async () => {
    stubViewport(true)
    render(<Staff />)
    await screen.findByTestId('site-nav')
    expect(screen.queryByTestId('site-subnav')).not.toBeInTheDocument()
  })

  it('スマートフォンの幅でも、ヘッダーに機能のタブを出す', async () => {
    stubViewport(false)
    render(<Mobile />)
    const nav = await screen.findByTestId('site-nav')
    expect(linkLabels(nav)).toEqual(['予定', '照合'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
