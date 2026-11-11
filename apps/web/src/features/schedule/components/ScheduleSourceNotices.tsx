import { formatDateKey } from '#/components/dateFormat'
import type {
  AllDayEvent,
  CalendarSyncStatus,
  OpenCalendarCutover,
  Schedule,
  SourceMode,
  Staff,
  UnlistedEventCount,
} from '#/api/types'

import { SCHEDULE_REVIEW_REASON_LABEL } from '../constants/scheduleLabels'
import { CALENDAR_SYNC_PROBLEM_LABEL, calendarSyncProblemsOf } from '../lib/calendarSync'
import { formatDateTime, formatDateTimeRange } from '../lib/dateTime'

export type ScheduleSourceNoticesProps = {
  sourceMode: SourceMode
  calendarSyncs: CalendarSyncStatus[]
  /** 予定の管理を buddy に移している間の、open の移行。無ければ null である。 */
  cutover?: OpenCalendarCutover | null
  /** 確認が必要な予定。期間の外の予定も含む。 */
  needsReview: Schedule[]
  /** 確認が必要な終日の予定。期間の外の予定も含む。押せないので、詳細を開かない。省くと出さない。 */
  needsReviewAllDayEvents?: AllDayEvent[]
  /** 期間に重なる、カレンダーに出せない予定の職員ごとの件数。省くと出さない。 */
  unlistedEventCounts?: UnlistedEventCount[]
  /** 確認が必要な予定の職員の名前を引く職員。 */
  staffList: Staff[]
  /** 同期が古いかを決める今の時刻。 */
  now: Date
  /** 確認が必要な予定を押したときに呼ぶ。 */
  onOpenSchedule: (scheduleId: Schedule['id']) => void
}

/**
 * 予定を Google カレンダーで管理している事業所（google_primary）で、カレンダーの上に出す通知。
 * Google カレンダーと buddy のどちらでも予定を変えられる案内を常に出し、同期が失敗しているか古いカレンダーがあれば同期の警告を、
 * 確認が必要な予定があれば、予定ごとの日時、職員、理由を出す。確認が必要な終日の予定は、時刻のある予定の後に、日付、職員、理由を押せない行で出す。表示の期間にカレンダーに出せない予定があれば、件数と職員ごとの件数を出し、
 * Google カレンダーで確認するよう促す。予定の中身は出さない。予定の管理を buddy に移している間は、移行中であることと、
 * Google カレンダーで予定を変えないよう頼み、buddy でも予定を変えられないことを伝える文と、移行を始めた職員と時刻を出す。
 * buddy_primary の事業所では何も出さない。
 */
export const ScheduleSourceNotices = ({
  sourceMode,
  calendarSyncs,
  cutover = null,
  needsReview,
  needsReviewAllDayEvents = [],
  unlistedEventCounts = [],
  staffList,
  now,
  onOpenSchedule,
}: ScheduleSourceNoticesProps) => {
  if (sourceMode !== 'google_primary') return null
  const problems = calendarSyncProblemsOf(calendarSyncs, now)
  const staffName = new Map(staffList.map((staff) => [staff.id, staff.name]))
  const unlistedTotal = unlistedEventCounts.reduce((sum, { count }) => sum + count, 0)
  const needsReviewTotal = needsReview.length + needsReviewAllDayEvents.length
  return (
    <div className="flex flex-col gap-2">
      <section
        className="rounded-8 border border-border bg-surface px-4 py-3"
        data-testid="schedule-calendar-google-primary"
      >
        <h2 className="text-label">予定は Google カレンダーと同期しています</h2>
        <p className="mt-2 text-body-dense">
          この事業所の予定は、Google カレンダーと buddy のどちらでも作成、変更できます。buddy
          で保存した予定は Google カレンダーにも書き、Google カレンダーで変えた予定は数分のうちに
          buddy に出ます。
        </p>
      </section>
      {cutover !== null && (
        <section
          className="rounded-8 border-l-4 border-primary bg-primary-surface px-4 py-3"
          data-testid="schedule-calendar-cutover"
        >
          <h2 className="text-label">予定の管理を buddy に移しています</h2>
          <p className="mt-2 text-body-dense">
            移行が終わるまで、Google カレンダーで予定を作成、変更しないでください。buddy
            でも予定を作成、変更できません。移行の間も、buddy には Google
            カレンダーの予定を表示します。
          </p>
          <p className="mt-1 text-body-dense" data-testid="schedule-calendar-cutover-started">
            開始: {cutover.started_by_name}、{formatDateTime(new Date(cutover.started_at))}
          </p>
        </section>
      )}
      {problems.length > 0 && (
        <section
          className="rounded-8 bg-warning-surface px-4 py-3"
          data-testid="schedule-calendar-sync-warning"
        >
          <h2 className="text-label text-warning">予定が最新でない可能性があります</h2>
          <ul className="mt-2 flex flex-col gap-1 text-body-dense">
            {problems.map(({ sync, problem }) => (
              <li
                data-testid={`schedule-calendar-sync-warning-${sync.external_calendar_id}`}
                key={sync.external_calendar_id}
              >
                <span className="font-bold">{sync.staff_name}</span>:{' '}
                {CALENDAR_SYNC_PROBLEM_LABEL[problem]}（最後に同期できた時刻:{' '}
                {sync.last_succeeded_at === null
                  ? 'なし'
                  : formatDateTime(new Date(sync.last_succeeded_at))}
                ）
              </li>
            ))}
          </ul>
        </section>
      )}
      {needsReviewTotal > 0 && (
        <section
          className="rounded-8 bg-warning-surface px-4 py-3"
          data-testid="schedule-calendar-needs-review"
        >
          <h2 className="text-label text-warning">
            確認が必要な予定が {needsReviewTotal} 件あります
          </h2>
          <ul className="mt-1 flex max-h-40 flex-col overflow-auto text-body-dense">
            {needsReview.map((schedule) => (
              <li key={schedule.id}>
                <button
                  className="min-h-11 rounded-8 text-left text-primary hover:underline focus-visible:focus-ring"
                  data-testid={`schedule-calendar-needs-review-${schedule.id}`}
                  onClick={() => onOpenSchedule(schedule.id)}
                  type="button"
                >
                  {formatDateTimeRange(new Date(schedule.startsAt), new Date(schedule.endsAt))}{' '}
                  {staffName.get(schedule.staffId) ?? '職員不明'}:{' '}
                  {schedule.reviewReason === undefined
                    ? ''
                    : SCHEDULE_REVIEW_REASON_LABEL[schedule.reviewReason]}
                </button>
              </li>
            ))}
            {needsReviewAllDayEvents.map((event) => (
              <li
                className="flex min-h-11 items-center"
                data-testid={`schedule-calendar-needs-review-all-day-${event.id}`}
                key={event.id}
              >
                {formatDateKey(event.startDate)}
                {event.endDate === event.startDate
                  ? ''
                  : `〜${formatDateKey(event.endDate)}`} 終日{' '}
                {staffName.get(event.staffId) ?? '職員不明'}:{' '}
                {event.reviewReason === undefined
                  ? ''
                  : SCHEDULE_REVIEW_REASON_LABEL[event.reviewReason]}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-body-dense">
            Google カレンダーでタイトルか繰り返しの規則を直してください。
          </p>
        </section>
      )}
      {unlistedTotal > 0 && (
        <section
          className="rounded-8 bg-warning-surface px-4 py-3"
          data-testid="schedule-calendar-unlisted"
        >
          <h2 className="text-label text-warning">
            カレンダーに出せない予定が {unlistedTotal} 件あります
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-body-dense">
            {unlistedEventCounts.map(({ staffId, count }) => (
              <li data-testid={`schedule-calendar-unlisted-${staffId}`} key={staffId}>
                <span className="font-bold">{staffName.get(staffId) ?? '職員不明'}</span>: {count}{' '}
                件
              </li>
            ))}
          </ul>
          <p className="mt-1 text-body-dense">
            2 日以上にわたる予定、24 時間以上の予定、日時を読めない予定、長さの無い予定は、buddy
            のカレンダーに出せません。Google カレンダーで確認してください。
          </p>
        </section>
      )}
    </div>
  )
}
