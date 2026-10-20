import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ReceiptResultView.stories'

const { Default, WithoutWarnings } = composeStories(stories)

describe('ReceiptResultView', () => {
  it('区分ごとの件数と、区分の見出しの下の行を出す', () => {
    render(<Default />)
    expect(screen.getByTestId('receipt-summary-mismatch').textContent).toBe('1 件')
    expect(screen.getByTestId('receipt-category-mismatch').textContent).toBe('不整合データ（1 件）')
    const table = screen.getByTestId('receipt-result-table')
    expect(within(table).getByText('10:05 ❌')).toBeDefined()
    expect(within(table).getByText('35 ❌ ❌ (20~29)')).toBeDefined()
  })

  it('照合に使わなかった予定があるときだけ一覧を出す', () => {
    const { unmount } = render(<Default />)
    expect(screen.getByTestId('receipt-warnings').textContent).toContain('2024-04-05 10:00')
    unmount()
    render(<WithoutWarnings />)
    expect(screen.queryByTestId('receipt-warnings')).toBeNull()
  })

  it('ダウンロードのボタンで onDownload を呼ぶ', async () => {
    const onDownload = fn()
    render(<Default onDownload={onDownload} />)
    await userEvent.click(screen.getByTestId('receipt-download'))
    expect(onDownload).toHaveBeenCalledOnce()
  })
})
