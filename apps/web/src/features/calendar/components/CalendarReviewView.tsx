import { Button, HelpToggle, Loading } from '@buddy/ui'

import type { CalendarExportIssue } from '#/api/types'

import { CalendarReviewTable } from './CalendarReviewTable'

/** 確認が必要な予定の画面の状態。 */
export type CalendarReviewViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; issues: readonly CalendarExportIssue[] }

export type CalendarReviewViewProps = {
  state: CalendarReviewViewState
  onRetry: () => void
  /** 一覧の行を押したときに呼ぶ。 */
  onSelect: (exportId: CalendarExportIssue['id']) => void
}

/**
 * 確認が必要な予定の画面の本文。タイトルと 1 文の説明の下に、Google カレンダーと食い違った予定を並べる。
 * 一覧に出ない予定があることは、初めてのときだけ要る説明なので、タイトルの右の ? のヘルプに入れる。
 */
export const CalendarReviewView = ({ state, onRetry, onSelect }: CalendarReviewViewProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <div className="relative flex items-center gap-1">
        <h1 className="text-heading-md">確認が必要な予定</h1>
        <HelpToggle data-testid="schedule-review-help">
          片方だけで変わった予定は、変わった側に合わせるので、ここには出ません。
        </HelpToggle>
      </div>
      <p className="max-w-3xl text-body">Google カレンダーと食い違った予定です。</p>
    </div>
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
          確認が必要な予定はありません。
        </p>
      ) : (
        <CalendarReviewTable issues={state.issues} onSelect={onSelect} />
      ))}
  </div>
)
