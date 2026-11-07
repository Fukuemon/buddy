import { composeStories } from '@storybook/react-vite'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ReceiptResultView.stories'

const { Default, NothingToCheck, WithCleanMatch, WithoutWarnings } = composeStories(stories)

describe('ReceiptResultView', () => {
  it('件数を区分の見出しにだけ出し、見出しの下に行を出す', () => {
    render(<Default />)
    expect(screen.queryByTestId('receipt-summary')).toBeNull()
    expect(screen.getByTestId('receipt-category-mismatch').textContent).toBe('不整合データ（1 件）')
  })

  it('印のあるセルは、記号を使わず、アイコンと読み上げの重さの名前と範囲を出す', () => {
    render(<Default />)
    const table = screen.getByTestId('receipt-result-table')
    expect(table.textContent).not.toMatch(/❌|※/)
    const marked = within(table).getAllByTestId('receipt-marked-cell')
    const visitDuration = marked.find((el) => el.textContent?.startsWith('35'))
    expect(visitDuration?.dataset.severity).toBe('mismatch')
    expect(visitDuration?.textContent).toBe('35（不一致）範囲 20〜29 分')
    // 不一致と注意の両方に当たるセルにも、アイコンは 1 つだけ置く
    expect(within(visitDuration!).getAllByTestId('receipt-mark-mismatch')).toHaveLength(1)
    expect(within(visitDuration!).queryByTestId('receipt-mark-note')).toBeNull()
    const sr = within(visitDuration!).getByText('（不一致）')
    expect(sr.classList.contains('sr-only')).toBe(true)
  })

  it('確認することの列に、行の判定の文を並べる', () => {
    render(<Default />)
    const findings = screen.getAllByTestId('receipt-findings').map((el) => el.textContent)
    expect(findings).toEqual([
      '開始時間が予定と違う実績の終了時間が範囲（20〜29 分）の外実績の提供時間 35 分が範囲（20〜29 分）の外加算が規則に合わない提供時間が予定と違う終了時間が予定と違う',
      '実績が無い',
      '予定が無い',
      '提供時間が予定と違う終了時間が予定と違う',
    ])
  })

  it('表の上に、2 つの印の意味を出す', () => {
    render(<Default />)
    expect(screen.getByTestId('receipt-mark-legend').textContent).toBe(
      '不一致: 規則に合わない注意: 範囲の中だが予定と違う',
    )
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

describe('表示する行の切り替え', () => {
  const categoryHeads = () =>
    screen.queryAllByTestId(/^receipt-category-(mismatch|schedule_only|visit_only|match)$/)

  it('開いたときは確認が要る行だけを出し、行の無い区分の見出しを出さない', () => {
    render(<WithCleanMatch />)
    expect(screen.getByTestId<HTMLInputElement>('receipt-row-view-needs').checked).toBe(true)
    expect(screen.getByTestId('receipt-row-view').textContent).toBe(
      '確認が要る行（1 件）全ての行（2 件）',
    )
    expect(categoryHeads().map((el) => el.textContent)).toEqual(['不整合データ（1 件）'])
    expect(screen.queryByText('佐藤 秋子')).toBeNull()
    expect(screen.getByTestId('receipt-row-count').textContent).toBe('1 件の行を表示しています。')
  })

  it('全ての行に切り替えると、注意の無い整合の行と、行の無い区分の見出しも出す', async () => {
    render(<WithCleanMatch />)
    await userEvent.click(screen.getByTestId('receipt-row-view-all'))
    expect(categoryHeads().map((el) => el.textContent)).toEqual([
      '不整合データ（1 件）',
      '予定のみ（0 件）',
      '実績のみ（0 件）',
      '整合データ（1 件）',
    ])
    expect(screen.getByText('佐藤 秋子')).toBeDefined()
    expect(screen.getByTestId('receipt-row-count').textContent).toBe('2 件の行を表示しています。')
  })

  it('注意のある整合の行は、確認が要る行に入る', () => {
    render(<Default />)
    expect(screen.getByTestId('receipt-row-view').textContent).toBe(
      '確認が要る行（4 件）全ての行（4 件）',
    )
    expect(screen.getByTestId('receipt-category-match').textContent).toBe('整合データ（1 件）')
  })

  it('確認が要る行が無いときは、表の代わりに知らせを出し、ボタンで全ての行を出す', async () => {
    render(<NothingToCheck />)
    expect(screen.queryByTestId('receipt-result-table')).toBeNull()
    expect(screen.getByTestId('receipt-needs-empty').textContent).toContain(
      '確認が要る行はありません。全ての行で、予定と実績が規則に合っています。',
    )
    await userEvent.click(screen.getByTestId('receipt-row-view-show-all'))
    expect(screen.getByTestId<HTMLInputElement>('receipt-row-view-all').checked).toBe(true)
    expect(screen.getByText('佐藤 秋子')).toBeDefined()
  })
})
