import { composeStories } from '@storybook/react-vite'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import * as stories from './StaffFilterLayout.stories'

const { Desktop, Mobile } = composeStories(stories)

// jsdom は matchMedia を持たない。表示の幅が 768px 以上かを決め、resize で変えて change を送る。
const stubViewport = (isDesktop: boolean) => {
  const listeners = new Set<() => void>()
  let matches = isDesktop
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  }))
  return {
    resize: (nextIsDesktop: boolean) => {
      matches = nextIsDesktop
      act(() => {
        for (const listener of listeners) listener()
      })
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StaffFilterLayout', () => {
  it('PC の幅では、職員の絞り込みを常に出し、開くボタンを出さない', () => {
    stubViewport(true)
    render(<Desktop />)
    expect(screen.getByRole('navigation', { name: '職員の絞り込み' })).toBeVisible()
    expect(screen.queryByTestId('staff-filter-open')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('スマートフォンの幅では、職員の絞り込みを閉じた状態で始める', () => {
    stubViewport(false)
    render(<Mobile />)
    const opener = screen.getByTestId('staff-filter-open')
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '職員の絞り込み' })).not.toBeInTheDocument()
  })

  it('開くボタンでドロワーを開き、閉じるボタンで閉じる', async () => {
    stubViewport(false)
    render(<Mobile />)
    const opener = screen.getByTestId('staff-filter-open')

    await userEvent.click(opener)
    const drawer = screen.getByRole('dialog', { name: '職員の絞り込み' })
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(opener).toHaveAttribute('aria-controls', drawer.id)
    expect(screen.getByRole('navigation', { name: '職員の絞り込み' })).toBeVisible()

    await userEvent.click(screen.getByTestId('staff-filter-close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(opener).toHaveFocus()
  })

  it('Escape（dialog の cancel）でドロワーを閉じる', async () => {
    stubViewport(false)
    render(<Mobile />)
    await userEvent.click(screen.getByTestId('staff-filter-open'))

    // jsdom は Escape で cancel を出さないので、ブラウザが出す cancel を直に送る
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-filter-open')).toHaveAttribute('aria-expanded', 'false')
  })

  it('開いたまま PC の幅にしてからスマートフォンの幅に戻すと、ドロワーは閉じている', async () => {
    const viewport = stubViewport(false)
    render(<Mobile />)
    await userEvent.click(screen.getByTestId('staff-filter-open'))
    expect(screen.getByRole('dialog', { name: '職員の絞り込み' })).toBeInTheDocument()

    viewport.resize(true)
    expect(screen.queryByTestId('staff-filter-open')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '職員の絞り込み' })).toBeVisible()

    viewport.resize(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-filter-open')).toHaveAttribute('aria-expanded', 'false')
  })
})
