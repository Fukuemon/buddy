import { Button, Dialog, DialogBody, DialogFooter, DialogHeader } from '@buddy/ui'
import { useId, type ReactNode } from 'react'

import type { CalendarExportIssue } from '#/api/types'

import {
  exportIssueReason,
  exportIssueReasonDetail,
  formatExportIssueDateTime,
} from '../lib/exportIssue'
import { formatDateTime } from '../lib/format'

export type CalendarReviewDialogProps = {
  issue: CalendarExportIssue
  /** 単発の予定の詳細を開く。繰り返しの予定には出さない。 */
  onOpenSchedule: (scheduleId: string) => void
  /** Google カレンダーの内容に合わせる確認のダイアログを開く。acceptable の予定にだけ出す。 */
  onAccept: () => void
  /** buddy の内容で書き直す確認のダイアログを開く。 */
  onRewrite: () => void
  /** ×、覆い、Escape キーで呼ぶ。 */
  onClose: () => void
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3 py-1">
    <dt className="text-text-secondary">{label}</dt>
    <dd>{children}</dd>
  </div>
)

/**
 * 一覧で押した予定の日時、職員、理由を示し、その予定で選べる操作をフッターに並べるダイアログ。
 * どちらの操作でも片方の変更が消えるので、片方を勧めないよう、どちらも主ボタンの色にしない。「キャンセル」は置かず、× で閉じる。
 */
export const CalendarReviewDialog = ({
  issue,
  onOpenSchedule,
  onAccept,
  onRewrite,
  onClose,
}: CalendarReviewDialogProps) => {
  const titleId = useId()
  const detail = exportIssueReasonDetail(issue)
  const scheduleId = issue.schedule_id
  return (
    <Dialog data-testid="calendar-review-dialog" labelledBy={titleId} onClose={onClose}>
      <DialogHeader
        closeTestId="calendar-review-close"
        onClose={onClose}
        title="食い違った予定"
        titleId={titleId}
      />
      <DialogBody>
        <dl className="text-body">
          <Row label="予定の日時">
            <span data-testid="calendar-review-dialog-datetime">
              {formatExportIssueDateTime(issue)}
            </span>
          </Row>
          <Row label="職員">{issue.staff_name}</Row>
          <Row label="最後に変わった日時">{formatDateTime(issue.updated_at)}</Row>
        </dl>
        <p className="text-body" data-testid="calendar-review-dialog-reason">
          {exportIssueReason(issue)}
          {detail}
        </p>
        {scheduleId !== null && (
          <div>
            <button
              className="inline-flex min-h-11 items-center rounded-8 text-label text-primary hover:underline focus-visible:focus-ring"
              data-testid={`calendar-review-open-${issue.id}`}
              onClick={() => onOpenSchedule(scheduleId)}
              type="button"
            >
              予定を開く
            </button>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        {issue.acceptable && (
          <Button
            data-testid={`calendar-review-accept-${issue.id}`}
            onClick={onAccept}
            size="S"
            variant="secondary"
          >
            Google の内容に合わせる
          </Button>
        )}
        <Button
          data-testid={`calendar-review-rewrite-${issue.id}`}
          onClick={onRewrite}
          size="S"
          variant="secondary"
        >
          buddy の内容で書き直す
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
