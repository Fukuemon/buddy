import { Button, Loading } from '@buddy/ui'

import type { Staff } from '#/api/types'

import { CalendarLinkTable, type CalendarLinkRow } from './CalendarLinkTable'
import { CalendarShareGuide } from './CalendarShareGuide'

/** カレンダーの連携の画面の状態。serviceAccount は、サービスアカウントが設定されていなければ null である。 */
export type CalendarLinkViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: readonly CalendarLinkRow[]; serviceAccount: string | null }

export type CalendarLinkViewProps = {
  state: CalendarLinkViewState
  onRetry: () => void
  onLink: (staffId: Staff['id']) => void
  onUnlink: (staffId: Staff['id']) => void
  onImport: (staffId: Staff['id']) => void
  /** クリップボードに写す。story とテストで差し替える。 */
  copy?: (text: string) => Promise<void>
}

/** カレンダーの連携の画面の本文。題と説明の文の下に、共有の手順と職員の一覧を並べる。 */
export const CalendarLinkView = ({
  state,
  onRetry,
  onLink,
  onUnlink,
  onImport,
  copy,
}: CalendarLinkViewProps) => (
  <div className="flex flex-col gap-6">
    <h1 className="text-heading-md">カレンダーの連携</h1>
    <p className="max-w-3xl text-body">
      職員ごとに Google カレンダーを結び付けます。結び付けたカレンダーの予定は、予定の取り込みで
      buddy に取り込めます。
    </p>
    {state.status === 'loading' && (
      <div data-testid="calendar-link-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="calendar-link-error" role="alert">
          {state.message}
        </p>
        <Button data-testid="calendar-link-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'ready' && (
      <>
        {state.serviceAccount === null ? (
          <p
            className="max-w-3xl border-l-4 border-warning bg-warning-surface px-3 py-2 text-body"
            data-testid="calendar-link-not-configured"
          >
            サービスアカウントが設定されていないので、カレンダーを結び付けられません。buddy
            を動かしている管理者に、Google カレンダーの設定を頼んでください。
          </p>
        ) : (
          <CalendarShareGuide copy={copy} serviceAccount={state.serviceAccount} />
        )}
        <CalendarLinkTable
          canLink={state.serviceAccount !== null}
          onImport={onImport}
          onLink={onLink}
          onUnlink={onUnlink}
          rows={state.rows}
        />
      </>
    )}
  </div>
)
