import { Button, Loading } from '@buddy/ui'
import type { ReactNode } from 'react'

/** 予定の取り込みの画面の状態。ready のときは、children に職員と期間の入力と結果を渡す。 */
export type CalendarImportViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-calendar' }
  | { status: 'ready' }

export type CalendarImportViewProps = {
  state: CalendarImportViewState
  onRetry: () => void
  children?: ReactNode
}

/** 予定の取り込みの画面の本文。タイトル、カレンダーの連携へのリンク、説明の文の下に、状態ごとの中身を並べる。 */
export const CalendarImportView = ({ state, onRetry, children }: CalendarImportViewProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h1 className="text-heading-md">予定の取り込み</h1>
      <a
        className="inline-flex min-h-11 items-center rounded-8 px-2 text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
        data-testid="calendar-import-link-settings"
        href="/schedule/link"
      >
        カレンダーの連携
      </a>
    </div>
    <p className="max-w-3xl text-body">
      職員の Google カレンダーの予定を、期間を選んで buddy
      に取り込みます。取り込む前に、取り込む予定と取り込まない予定をプレビューできます。
    </p>
    {state.status === 'loading' && (
      <div data-testid="calendar-import-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="calendar-import-load-error" role="alert">
          {state.message}
        </p>
        <Button data-testid="calendar-import-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'no-calendar' && (
      <output
        className="block max-w-3xl border-l-4 border-border bg-surface-subtle px-3 py-2 text-body"
        data-testid="calendar-import-no-calendar"
      >
        Google
        カレンダーを結び付けた職員がいません。カレンダーの連携で、職員のカレンダーを結び付けてください。
      </output>
    )}
    {state.status === 'ready' && children}
  </div>
)
