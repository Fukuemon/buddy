import { Button } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { CalendarExportIssue } from '#/api/types'

import { exportIssueReason, formatExportIssueDateTime } from '../lib/exportIssue'
import { formatDateTime } from '../lib/format'

export type CalendarReviewTableProps = {
  issues: readonly CalendarExportIssue[]
  /** 単発の予定の詳細を開く。繰り返しの予定には出さない。 */
  onOpenSchedule: (scheduleId: string) => void
  onRewrite: (exportId: CalendarExportIssue['id']) => void
  /** Google カレンダーの内容に合わせる。acceptable の予定にだけ出す。 */
  onAccept: (exportId: CalendarExportIssue['id']) => void
}

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <td className="block px-4 py-1 text-body-dense desktop:table-cell desktop:px-5 desktop:py-3">
    <span className="block text-caption text-text-secondary desktop:hidden">{label}</span>
    {children}
  </td>
)

const HEADERS = ['予定の日時', '職員', '理由', '最後に変わった日時'] as const

/**
 * Google カレンダーと食い違った予定を、日時、職員、理由、最後に変わった日時で並べ、予定を開くか、buddy の内容で書き直すか、
 * Google カレンダーの内容に合わせる表。
 * 予定のタイトルと利用者名は、Google カレンダーの側の値を出さないため、表に出さない。幅 768px 未満では、行ごとの箱に縦に積む。
 */
export const CalendarReviewTable = ({
  issues,
  onOpenSchedule,
  onRewrite,
  onAccept,
}: CalendarReviewTableProps) => (
  <table className="block w-full border-collapse desktop:table" data-testid="calendar-review-table">
    <thead className="hidden desktop:table-header-group">
      <tr className="border-b border-border">
        {HEADERS.map((header) => (
          <th
            className="px-5 py-2 text-left text-body-dense font-normal text-text-secondary"
            key={header}
            scope="col"
          >
            {header}
          </th>
        ))}
        <th className="px-5 py-2" scope="col">
          <span className="sr-only">操作</span>
        </th>
      </tr>
    </thead>
    <tbody className="flex flex-col gap-3 desktop:table-row-group">
      {issues.map((issue) => (
        <tr
          className="block rounded-8 border border-border py-2 desktop:table-row desktop:rounded-none desktop:border-0 desktop:border-b desktop:py-0"
          data-testid={`calendar-review-row-${issue.id}`}
          key={issue.id}
        >
          <Cell label="予定の日時">
            <span data-testid={`calendar-review-datetime-${issue.id}`}>
              {formatExportIssueDateTime(issue)}
            </span>
          </Cell>
          <Cell label="職員">{issue.staff_name}</Cell>
          <Cell label="理由">
            <span data-testid={`calendar-review-reason-${issue.id}`}>
              {exportIssueReason(issue)}
            </span>
          </Cell>
          <Cell label="最後に変わった日時">{formatDateTime(issue.updated_at)}</Cell>
          <td className="block px-4 py-2 desktop:table-cell desktop:px-5">
            <div className="flex flex-wrap gap-2 desktop:justify-end">
              {issue.schedule_id !== null && (
                <Button
                  data-testid={`calendar-review-open-${issue.id}`}
                  onClick={() => issue.schedule_id !== null && onOpenSchedule(issue.schedule_id)}
                  size="S"
                  variant="secondary"
                >
                  予定を開く
                </Button>
              )}
              {issue.acceptable && (
                <Button
                  data-testid={`calendar-review-accept-${issue.id}`}
                  onClick={() => onAccept(issue.id)}
                  size="S"
                  variant="secondary"
                >
                  Google の内容に合わせる
                </Button>
              )}
              <Button
                data-testid={`calendar-review-rewrite-${issue.id}`}
                onClick={() => onRewrite(issue.id)}
                size="S"
              >
                buddy の内容で書き直す
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)
