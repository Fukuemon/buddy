import type { CalendarSyncStatus, Schedule, SourceMode, Staff } from '#/api/types'

import { SCHEDULE_REVIEW_REASON_LABEL } from '../constants/scheduleLabels'
import { CALENDAR_SYNC_PROBLEM_LABEL, calendarSyncProblemsOf } from '../lib/calendarSync'
import { formatDateTime, formatDateTimeRange } from '../lib/dateTime'

export type ScheduleSourceNoticesProps = {
  sourceMode: SourceMode
  calendarSyncs: CalendarSyncStatus[]
  /** 確認が必要な予定。期間の外の予定も含む。 */
  needsReview: Schedule[]
  /** 確認が必要な予定の職員の名前を引く職員。 */
  staffList: Staff[]
  /** 同期が古いかを決める今の時刻。 */
  now: Date
  /** 確認が必要な予定を押したときに呼ぶ。 */
  onOpenSchedule: (scheduleId: Schedule['id']) => void
}

/**
 * Google カレンダーを予定の正本にする事業所（google_primary）で、カレンダーの上に出す通知。
 * Google カレンダーで予定を編集する案内を常に出し、同期が失敗しているか古いカレンダーがあれば同期の警告を、
 * 確認が必要な予定があれば、予定ごとの日時、職員、理由を出す。buddy_primary の事業所では何も出さない。
 */
export const ScheduleSourceNotices = ({
  sourceMode,
  calendarSyncs,
  needsReview,
  staffList,
  now,
  onOpenSchedule,
}: ScheduleSourceNoticesProps) => {
  if (sourceMode !== 'google_primary') return null
  const problems = calendarSyncProblemsOf(calendarSyncs, now)
  const staffName = new Map(staffList.map((staff) => [staff.id, staff.name]))
  return (
    <div className="flex flex-col gap-2">
      <section
        className="rounded-8 border border-border bg-surface px-4 py-3"
        data-testid="schedule-calendar-google-primary"
      >
        <h2 className="text-label">予定は Google カレンダーで管理しています</h2>
        <p className="mt-2 text-body-dense">
          この事業所の予定は Google カレンダーで作成、変更してください。buddy
          には、同期した予定を表示します。
        </p>
      </section>
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
      {needsReview.length > 0 && (
        <section
          className="rounded-8 bg-warning-surface px-4 py-3"
          data-testid="schedule-calendar-needs-review"
        >
          <h2 className="text-label text-warning">
            確認が必要な予定が {needsReview.length} 件あります
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
          </ul>
          <p className="mt-1 text-body-dense">
            Google カレンダーでタイトルか繰り返しの規則を直してください。
          </p>
        </section>
      )}
    </div>
  )
}
