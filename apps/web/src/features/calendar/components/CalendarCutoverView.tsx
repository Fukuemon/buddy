import { BusyLabel, Button, buttonClassName, Loading } from '@buddy/ui'

import type {
  CalendarCutover,
  CalendarCutoverCalendar,
  CalendarCutoverUnmet,
  Staff,
} from '#/api/types'

import { formatCutoverImport, formatCutoverSync } from '../lib/cutover'
import { formatDateRange, formatDateTime } from '../lib/format'
import { CalendarCutoverUnmetTable } from './CalendarCutoverUnmetTable'
import { RefetchErrorMessage } from '#/components/page/RefetchErrorMessage'

/**
 * 予定の正本の切り替えの画面の状態。buddy_primary は事業所の予定の正本が buddy（切り替え済み）、not_started は Google カレンダーが正本で
 * 切り替えを始めていない、open は切り替え中、completed はこの画面で切り替えを完了した直後である。
 */
export type CalendarCutoverViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'buddy_primary' }
  | { status: 'not_started'; calendars: readonly CalendarCutoverCalendar[] }
  | { status: 'open'; cutover: CalendarCutover; calendars: readonly CalendarCutoverCalendar[] }
  | { status: 'completed' }

export type CalendarCutoverViewProps = {
  state: CalendarCutoverViewState
  onRetry: () => void
  /** 読み終えた後に読み直して、データを読めなかったか。 */
  refetchFailed?: boolean
  /** 読み終えた後に読めなかったデータだけを読み直す。 */
  onRefetch?: () => void
  onStart: () => void
  isStarting: boolean
  /** 始められなかったときの文。 */
  startError?: string
  onComplete: () => void
  isCompleting: boolean
  /** 完了できなかったときの文。完了の確認を満たさないときは、unmet に一覧を渡す。 */
  completeError?: string
  /** 完了の確認を満たさないカレンダーと予定。 */
  unmet?: readonly CalendarCutoverUnmet[]
  /** 切り替えをやめる確認のダイアログを開く。 */
  onCancel: () => void
  /** 職員の予定の取り込みの画面の URL。 */
  importHref: (staffId: Staff['id']) => string
}

const linkClassName =
  'inline-flex min-h-11 items-center rounded-8 px-2 text-label text-primary underline underline-offset-4 focus-visible:focus-ring'

const headerCellClassName = 'px-3 py-2 text-left text-body-dense font-normal text-text-secondary'
const cellClassName = 'px-3 py-2 text-body-dense'

/** 切り替えの間に Google カレンダーで予定を変えないよう、職員に頼む案内。 */
const NoEditNotice = () => (
  <section
    className="max-w-3xl rounded-8 bg-warning-surface px-4 py-3"
    data-testid="calendar-cutover-no-edit"
  >
    <h2 className="text-label text-warning">切り替えの間は、Google カレンダーで予定を変えない</h2>
    <p className="mt-2 text-body-dense">
      職員に、切り替えが終わるまで Google
      カレンダーで予定を作成、変更しないよう頼んでください。取り込んだ後に変えた予定は、完了するときに見つかり、取り込み直すまで完了できません。
    </p>
  </section>
)

/** 結び付けたカレンダーごとの、この切り替えの最後の取り込みと最後の同期の表。open の切り替えのときは、取り込みの画面へのリンクを置く。 */
const CutoverCalendarTable = ({
  calendars,
  importHref,
}: {
  calendars: readonly CalendarCutoverCalendar[]
  importHref?: (staffId: Staff['id']) => string
}) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse" data-testid="calendar-cutover-calendars">
      <thead>
        <tr className="border-b border-border">
          <th className={headerCellClassName} scope="col">
            職員
          </th>
          {importHref !== undefined && (
            <th className={headerCellClassName} scope="col">
              この切り替えの最後の取り込み
            </th>
          )}
          <th className={headerCellClassName} scope="col">
            最後の同期
          </th>
          {importHref !== undefined && (
            <th className={headerCellClassName} scope="col">
              <span className="sr-only">操作</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {calendars.map((calendar) => (
          <tr
            className="border-b border-border bg-surface"
            data-testid={`calendar-cutover-calendar-${calendar.staff_id}`}
            key={calendar.external_calendar_id}
          >
            <td className={`${cellClassName} whitespace-nowrap`}>{calendar.staff_name}</td>
            {importHref !== undefined && (
              <td
                className={cellClassName}
                data-testid={`calendar-cutover-import-${calendar.staff_id}`}
              >
                {formatCutoverImport(calendar)}
              </td>
            )}
            <td
              className={cellClassName}
              data-testid={`calendar-cutover-sync-${calendar.staff_id}`}
            >
              {formatCutoverSync(calendar)}
            </td>
            {importHref !== undefined && (
              <td className={`${cellClassName} text-right`}>
                <a
                  className={buttonClassName({ variant: 'secondary', size: 'S' })}
                  data-testid={`calendar-cutover-open-import-${calendar.staff_id}`}
                  href={importHref(calendar.staff_id)}
                >
                  {calendar.last_import === null ? '取り込む' : '取り込み直す'}
                </a>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

/**
 * 予定の正本の切り替えの画面の本文。タイトル、カレンダーの連携へのリンク、説明の文の下に、状態ごとの中身を並べる。
 * 始める前は手順と同期の状況と始めるボタンを、切り替え中はカレンダーごとの取り込みと同期の状況と、完了とやめるのボタンを出す。
 * 完了の確認を満たさないときは、満たさないカレンダーと予定の一覧を出す。
 */
export const CalendarCutoverView = ({
  state,
  onRetry,
  refetchFailed,
  onRefetch,
  onStart,
  isStarting,
  startError,
  onComplete,
  isCompleting,
  completeError,
  unmet,
  onCancel,
  importHref,
}: CalendarCutoverViewProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h1 className="text-heading-md">予定の正本の切り替え</h1>
      <a
        className={linkClassName}
        data-testid="calendar-cutover-link-settings"
        href="/schedule/link"
      >
        カレンダーの連携
      </a>
    </div>
    <p className="max-w-3xl text-body">
      Google カレンダーで管理している予定を buddy に取り込み、この事業所の予定の正本を buddy
      に切り替えます。切り替えた後は、予定を buddy で作成、変更し、Google カレンダーには buddy
      の予定を書き出します。
    </p>
    {refetchFailed === true && onRefetch !== undefined && (
      <RefetchErrorMessage onRetry={onRefetch} />
    )}
    {state.status === 'loading' && (
      <div data-testid="calendar-cutover-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="calendar-cutover-load-error" role="alert">
          {state.message}
        </p>
        <Button data-testid="calendar-cutover-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'buddy_primary' && (
      <output
        className="block max-w-3xl border-l-4 border-border bg-surface-subtle px-3 py-2 text-body"
        data-testid="calendar-cutover-buddy-primary"
      >
        この事業所の予定の正本は buddy です。予定は buddy で作成、変更します。
      </output>
    )}
    {state.status === 'completed' && (
      <div className="flex flex-col items-start gap-3">
        <output
          className="block max-w-3xl border-l-4 border-success bg-success-surface px-3 py-2 text-body"
          data-testid="calendar-cutover-completed"
        >
          切り替えを完了しました。この事業所の予定の正本は buddy
          です。予定のカレンダーで、予定を作成できます。
        </output>
        <a
          className={buttonClassName({ size: 'S' })}
          data-testid="calendar-cutover-open-calendar"
          href="/schedule"
        >
          予定のカレンダーを開く
        </a>
      </div>
    )}
    {state.status === 'not_started' && (
      <>
        <section className="flex max-w-3xl flex-col gap-2">
          <h2 className="text-heading-sm">切り替えの手順</h2>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-6 text-body">
            <li>
              切り替えを始めます。始めた月の初日から先の全ての予定が、取り込みの対象になります。
            </li>
            <li>
              職員ごとに、予定を取り込みます。取り込みの間も、予定のカレンダーには Google
              カレンダーの予定が出ます。
            </li>
            <li>全ての職員を取り込み、同期が終わったら、完了します。</li>
          </ol>
        </section>
        <NoEditNotice />
        <section className="flex flex-col gap-2">
          <h2 className="text-heading-sm">カレンダーの同期</h2>
          <p className="text-caption text-text-secondary">
            全てのカレンダーの最後の同期が成功していると、始められます。
          </p>
          <CutoverCalendarTable calendars={state.calendars} />
        </section>
        <div className="flex flex-col items-start gap-3">
          {startError !== undefined && (
            <p
              className="text-body text-danger"
              data-testid="calendar-cutover-start-error"
              role="alert"
            >
              {startError}
            </p>
          )}
          <Button
            data-testid="calendar-cutover-start"
            disabled={isStarting}
            onClick={onStart}
            size="S"
          >
            <BusyLabel busy={isStarting}>
              {isStarting ? '始めています' : '切り替えを始める'}
            </BusyLabel>
          </Button>
        </div>
      </>
    )}
    {state.status === 'open' && (
      <>
        <output
          className="block max-w-3xl border-l-4 border-primary bg-primary-surface px-3 py-2 text-body"
          data-testid="calendar-cutover-open"
        >
          切り替え中です（{formatDateTime(state.cutover.started_at)} に開始）。取り込みの期間:{' '}
          {formatDateRange(state.cutover.range_start, null)}
        </output>
        <NoEditNotice />
        <section className="flex flex-col gap-2">
          <h2 className="text-heading-sm">職員ごとの取り込み</h2>
          <p className="text-caption text-text-secondary">
            全ての職員を取り込み、最後の取り込みの後に同期が成功すると、完了できます。
          </p>
          <CutoverCalendarTable calendars={state.calendars} importHref={importHref} />
        </section>
        {unmet !== undefined && unmet.length > 0 && <CalendarCutoverUnmetTable items={unmet} />}
        <div className="flex flex-col items-start gap-3">
          {completeError !== undefined && (
            <p
              className="text-body text-danger"
              data-testid="calendar-cutover-complete-error"
              role="alert"
            >
              {completeError}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="calendar-cutover-complete"
              disabled={isCompleting}
              onClick={onComplete}
              size="S"
            >
              <BusyLabel busy={isCompleting}>
                {isCompleting ? '確認しています' : '完了する'}
              </BusyLabel>
            </Button>
            <Button
              data-testid="calendar-cutover-cancel"
              disabled={isCompleting}
              onClick={onCancel}
              size="S"
              variant="secondary"
            >
              切り替えをやめる
            </Button>
          </div>
        </div>
      </>
    )}
  </div>
)
