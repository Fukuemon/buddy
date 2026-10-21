import { Button, Loading } from '@buddy/ui'

import type { CalendarExportIssue } from '#/api/types'

import { CalendarReviewTable } from './CalendarReviewTable'

/** 確かめが要る予定の画面の状態。 */
export type CalendarReviewViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; issues: readonly CalendarExportIssue[] }

export type CalendarReviewViewProps = {
  state: CalendarReviewViewState
  onRetry: () => void
  onOpenSchedule: (scheduleId: string) => void
  onRewrite: (exportId: CalendarExportIssue['id']) => void
}

/** 確かめが要る予定の画面の本文。題と説明の文の下に、Google カレンダーに書き出せなかった予定を並べる。 */
export const CalendarReviewView = ({
  state,
  onRetry,
  onOpenSchedule,
  onRewrite,
}: CalendarReviewViewProps) => (
  <div className="flex flex-col gap-6">
    <h1 className="text-heading-md">確かめが要る予定</h1>
    <p className="max-w-3xl text-body">
      buddy の予定のうち、Google カレンダーに書き出せなかった予定です。Google
      カレンダーで直された予定は、buddy に取り込みません。予定を開いて buddy の内容を確かめ、buddy
      の内容で書き直すと、Google カレンダーの予定を buddy の内容にします。
    </p>
    {state.status === 'loading' && (
      <div data-testid="calendar-review-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="calendar-review-error" role="alert">
          {state.message}
        </p>
        <Button data-testid="calendar-review-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'ready' &&
      (state.issues.length === 0 ? (
        <p className="text-body text-text-secondary" data-testid="calendar-review-empty">
          確かめが要る予定はありません。
        </p>
      ) : (
        <CalendarReviewTable
          issues={state.issues}
          onOpenSchedule={onOpenSchedule}
          onRewrite={onRewrite}
        />
      ))}
  </div>
)
