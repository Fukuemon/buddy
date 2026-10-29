import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stubViewport } from '#/test/stubViewport'

import * as stories from './SchedulePageLayout.stories'

const { Month, Mobile } = composeStories(stories)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SchedulePageLayout', () => {
  it('PC の幅では、左の欄にミニカレンダーと職員の絞り込みを出し、メニューのボタンで閉じて開く', async () => {
    stubViewport(true)
    render(<Month />)
    const opener = await screen.findByTestId('site-sidebar-open')
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByTestId('mini-calendar')).toBeVisible()
    expect(screen.getByRole('navigation', { name: '職員の絞り込み' })).toBeVisible()

    await userEvent.click(opener)
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('mini-calendar')).not.toBeInTheDocument()

    await userEvent.click(opener)
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('mini-calendar')).toBeVisible()
  })

  it('スマートフォンの幅では、左の欄を閉じたドロワーに入れ、メニューのボタンで開いて閉じる', async () => {
    stubViewport(false)
    render(<Mobile />)
    const opener = await screen.findByTestId('site-sidebar-open')
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: '職員の絞り込み' })).not.toBeInTheDocument()

    await userEvent.click(opener)
    const drawer = screen.getByRole('dialog', { name: '日付と絞り込み' })
    expect(opener).toHaveAttribute('aria-controls', drawer.id)
    expect(within(drawer).getByTestId('mini-calendar')).toBeInTheDocument()
    expect(within(drawer).queryByTestId('site-nav')).not.toBeInTheDocument()

    // jsdom は Escape で cancel を出さないので、ブラウザが出す cancel を直に送る
    fireEvent(drawer, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveAttribute('aria-expanded', 'false')
  })

  it('ドロワーを開いたまま PC の幅にすると、ドロワーを閉じて左の欄に出す', async () => {
    const viewport = stubViewport(false)
    render(<Mobile />)
    await userEvent.click(await screen.findByTestId('site-sidebar-open'))
    expect(screen.getByRole('dialog', { name: '日付と絞り込み' })).toBeInTheDocument()

    viewport.resize(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('mini-calendar')).toBeVisible()
  })
})
