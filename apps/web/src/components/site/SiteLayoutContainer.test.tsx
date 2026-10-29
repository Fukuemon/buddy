import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './SiteLayoutContainer.stories'

const { StaffManager, Staff, Mobile } = composeStories(stories)

const linkLabels = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SiteLayoutContainer', () => {
  it('職員の管理の権限を持つ職員には、PC の幅で、左のサイドバーに 4 つのリンクを出し、今の画面に印を付ける', async () => {
    stubViewport(true)
    render(<StaffManager />)
    const nav = await screen.findByTestId('site-nav')
    expect(linkLabels(nav)).toEqual(['予定', '取り込み', '要確認', '照合'])
    expect(within(nav).getByRole('link', { name: '取り込み' })).toHaveAttribute(
      'href',
      '/schedule/import',
    )
    expect(within(nav).getByRole('link', { name: '要確認' })).toHaveAttribute(
      'href',
      '/schedule/review',
    )
    expect(within(nav).getByRole('link', { name: '照合' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: '予定' })).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('site-nav-open')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('PC の幅では、メニューのボタンでサイドバーを閉じ、もう一度押すと開く', async () => {
    stubViewport(true)
    render(<StaffManager />)
    const opener = await screen.findByTestId('site-nav-open')

    await userEvent.click(opener)
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('site-nav')).not.toBeInTheDocument()

    await userEvent.click(opener)
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('site-nav')).toBeVisible()
  })

  it('職員の管理の権限を持たない職員には、取り込みと要確認のリンクを出さない', async () => {
    stubViewport(true)
    render(<Staff />)
    const nav = await screen.findByTestId('site-nav')
    expect(linkLabels(nav)).toEqual(['予定', '照合'])
  })

  it('スマートフォンの幅では、リンクを閉じたドロワーに入れ、メニューのボタンで開いて閉じる', async () => {
    stubViewport(false)
    render(<Mobile />)
    const opener = await screen.findByTestId('site-nav-open')
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '画面' })).not.toBeInTheDocument()

    await userEvent.click(opener)
    const drawer = screen.getByRole('dialog', { name: 'メニュー' })
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(opener).toHaveAttribute('aria-controls', drawer.id)
    const nav = within(drawer).getByTestId('site-nav')
    expect(linkLabels(nav)).toEqual(['予定', '取り込み', '要確認', '照合'])
    expect(within(nav).getByRole('link', { name: '照合' })).toHaveAttribute('aria-current', 'page')

    // jsdom は Escape で cancel を出さないので、ブラウザが出す cancel を直に送る
    fireEvent(drawer, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveAttribute('aria-expanded', 'false')
  })

  it('ドロワーを開いたまま PC の幅にすると、ドロワーを閉じて左のサイドバーにリンクを出す', async () => {
    const viewport = stubViewport(false)
    render(<Mobile />)
    await userEvent.click(await screen.findByTestId('site-nav-open'))
    expect(screen.getByRole('dialog', { name: 'メニュー' })).toBeInTheDocument()

    viewport.resize(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('site-nav')).toBeVisible()
  })
})
