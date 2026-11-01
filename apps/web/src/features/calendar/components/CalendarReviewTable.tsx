import { RowTable, RowTableRow } from '@buddy/ui'

import type { CalendarExportIssue } from '#/api/types'

import { exportIssueReason, formatExportIssueDateTime } from '../lib/exportIssue'
import { formatDateTime } from '../lib/format'

export type CalendarReviewTableProps = {
  issues: readonly CalendarExportIssue[]
  /** 行を押したときに呼ぶ。予定の確認のダイアログを開く。 */
  onSelect: (exportId: CalendarExportIssue['id']) => void
}

/**
 * 行の testid。予定ごとに 1 行なので、単発の予定は予定の ID で、繰り返しの予定は繰り返しの予定の ID で作る。
 * 書き出しの ID は画面にも予定の応答にも出ないので、E2E は予定の ID で行を指す。
 * 両方の ID が無い書き出しは API の制約で起きないが、起きても行が区別できるよう書き出しの ID で作る。
 */
const rowTestId = (issue: CalendarExportIssue) =>
  issue.schedule_id !== null
    ? `calendar-review-row-schedule-${issue.schedule_id}`
    : `calendar-review-row-recurring-${issue.recurring_schedule_id ?? issue.id}`

/**
 * Google カレンダーと食い違った予定を、日時、職員、理由、最後に変わった日時で並べる表。行を押すと、予定の確認のダイアログを開く。
 * 予定のタイトルと利用者名は、Google カレンダーの側の値を出さないため、表に出さない。
 * 幅 768px 未満では、理由を出さず、予定の確認のダイアログだけで示す。
 */
export const CalendarReviewTable = ({ issues, onSelect }: CalendarReviewTableProps) => (
  <RowTable
    data-testid="calendar-review-table"
    metaHeaders={['職員', '理由', '最後に変わった日時']}
    primaryHeader="予定の日時"
  >
    {issues.map((issue) => (
      <RowTableRow
        data-testid={rowTestId(issue)}
        key={issue.id}
        meta={[
          { header: '職員', value: issue.staff_name, isNoWrap: true },
          {
            header: '理由',
            value: (
              <span data-testid={`calendar-review-reason-${issue.id}`}>
                {exportIssueReason(issue)}
              </span>
            ),
            isDesktopOnly: true,
          },
          { header: '最後に変わった日時', value: formatDateTime(issue.updated_at), isNoWrap: true },
        ]}
        name={
          <span data-testid={`calendar-review-datetime-${issue.id}`}>
            {formatExportIssueDateTime(issue)}
          </span>
        }
        onSelect={() => onSelect(issue.id)}
      />
    ))}
  </RowTable>
)
