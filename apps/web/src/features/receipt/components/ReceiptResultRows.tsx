import { ListEmpty, SegmentedControl } from '@buddy/ui'
import { useState } from 'react'

import type { ReceiptRow } from '#/api/types'

import { needsCheck } from '../lib/reportCells'
import { ReceiptMarkLegend } from './ReceiptMark'
import { ReceiptResultTable } from './ReceiptResultTable'

type RowView = 'needs' | 'all'

/**
 * 結果の表と、表示する行の切り替え。開いたときは確認が要る行だけを出し、「全ての行」で全ての行を出す。
 * 切り替えの状態は URL に持たない。結果は画面を読み直すと消えるので、URL に残しても戻せないためである。
 */
export const ReceiptResultRows = ({ rows }: { rows: readonly ReceiptRow[] }) => {
  const [view, setView] = useState<RowView>('needs')
  const needs = rows.filter(needsCheck)
  const shown = view === 'needs' ? needs : rows
  return (
    <div className="flex flex-col gap-4">
      <div className="desktop:max-w-md">
        <SegmentedControl
          data-testid="receipt-row-view"
          label="表示する行"
          onChange={setView}
          options={[
            { id: 'needs', label: `確認が要る行（${needs.length} 件）` },
            { id: 'all', label: `全ての行（${rows.length} 件）` },
          ]}
          value={view}
        />
      </div>
      <p aria-live="polite" className="sr-only" data-testid="receipt-row-count">
        {shown.length} 件の行を表示しています。
      </p>
      {view === 'needs' && needs.length === 0 ? (
        <ListEmpty
          clearLabel="全ての行を表示"
          clearTestId="receipt-row-view-show-all"
          data-testid="receipt-needs-empty"
          message="確認が要る行はありません。全ての行で、予定と実績が規則に合っています。"
          onClear={() => setView('all')}
        />
      ) : (
        <>
          <ReceiptMarkLegend />
          <ReceiptResultTable hidesEmptyCategories={view === 'needs'} rows={shown} />
        </>
      )}
    </div>
  )
}
