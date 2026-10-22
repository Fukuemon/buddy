import { Button, buttonClassName } from '@buddy/ui'

import type { ReceiptReport } from '#/api/types'

import { RECEIPT_CATEGORIES } from '../lib/reportCells'
import { ReceiptResultTable } from './ReceiptResultTable'

export type ReceiptResultViewProps = {
  report: ReceiptReport
  /** 照合の対象の説明。例は「2024 年 4 月の Google カレンダー」。 */
  sourceLabel: string
  onDownload: () => void
  /** 照合の画面へ戻るリンクの先。 */
  checkAgainHref: string
}

/** 照合の結果。区分ごとの件数、CSV のダウンロード、照合に使わなかった予定、結果の表を並べる。 */
export const ReceiptResultView = ({
  report,
  sourceLabel,
  onDownload,
  checkAgainHref,
}: ReceiptResultViewProps) => (
  <section className="flex min-w-0 flex-col gap-6" data-testid="receipt-result">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading-md">照合の結果</h1>
        <p className="text-body-dense text-text-secondary">予定: {sourceLabel}</p>
      </div>
      <div className="flex gap-3">
        <a className={buttonClassName({ variant: 'secondary' })} href={checkAgainHref}>
          別のファイルで照合する
        </a>
        <Button onClick={onDownload} data-testid="receipt-download">
          CSV をダウンロード
        </Button>
      </div>
    </div>
    <dl className="flex flex-wrap gap-3" data-testid="receipt-summary">
      {RECEIPT_CATEGORIES.map(({ category, label }) => (
        <div
          key={category}
          className="flex min-w-36 flex-col gap-1 rounded-8 bg-surface p-4 ring-1 ring-border"
        >
          <dt className="text-body-dense text-text-secondary">{label}</dt>
          <dd className="text-heading-md" data-testid={`receipt-summary-${category}`}>
            {report.summary[category]} 件
          </dd>
        </div>
      ))}
    </dl>
    {report.warnings.length > 0 && (
      <div
        className="flex flex-col gap-2 rounded-8 bg-warning-surface p-4"
        data-testid="receipt-warnings"
      >
        <h2 className="text-label">照合に使わなかった予定（{report.warnings.length} 件）</h2>
        <p className="text-body-dense">
          次の Google
          カレンダーの予定は、照合に使いませんでした。予定を直して、もう一度照合してください。
        </p>
        <ul className="list-disc pl-6 text-body-dense">
          {report.warnings.map((w) => (
            <li key={`${w.calendar_id}-${w.event_id}`}>
              {w.start.slice(0, 16).replace('T', ' ')}: {w.message}
            </li>
          ))}
        </ul>
      </div>
    )}
    <ReceiptResultTable rows={report.rows} />
  </section>
)
