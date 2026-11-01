import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ReceiptResultView.stories'

const { Default, WithoutWarnings } = composeStories(stories)

describe('ReceiptResultView', () => {
  it('件数を区分の見出しにだけ出し、見出しの下に行を出す', () => {
    render(<Default />)
    expect(screen.queryByTestId('receipt-summary')).toBeNull()
    expect(screen.getByTestId('receipt-category-mismatch').textContent).toBe('不整合データ（1 件）')
    const table = screen.getByTestId('receipt-result-table')
    expect(within(table).getByText('10:05 ❌')).toBeDefined()
    expect(within(table).getByText('35 ❌ ❌ (20~29)')).toBeDefined()
  })

  it('片側の無い行は、無い側のセルを読み上げの「データなし」だけにする', () => {
    render(<Default />)
    const noData = within(screen.getByTestId('receipt-result-table')).getAllByText('データなし')
    const hidden = noData.filter((el) => el.classList.contains('sr-only'))
    // 予定のみの行の実績の側の 5 セルと、実績のみの行の予定の側の 4 セル
    expect(hidden).toHaveLength(9)
    // 実績のみの行の、空の提供時間は見える
    expect(noData.length - hidden.length).toBe(1)
  })

  it('照合に使わなかった予定があるときだけ一覧を出す', () => {
    const { unmount } = render(<Default />)
    const warnings = screen.getByTestId('receipt-warnings').textContent
    expect(warnings).toContain(
      '2024-04-05 10:00: タイトルが「【サービス内容】利用者名」の形になっていません。',
    )
    expect(warnings).not.toContain('の組がない')
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
