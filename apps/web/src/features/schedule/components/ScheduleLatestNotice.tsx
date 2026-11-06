import type { Patient, Schedule, Staff } from '#/api/types'

import { SCHEDULE_KIND_LABEL } from '../constants/scheduleLabels'
import { formatDateTimeRange } from '../lib/dateTime'

export type ScheduleLatestNoticeProps = {
  /** Google カレンダーから読み直した最新の予定。 */
  latest: Schedule
  staffList: Staff[]
  patients: Patient[]
}

/**
 * 予定を開いた後に Google カレンダーで予定が変わっていたとき（409 の google_event_changed）に、編集のフォームの上に出す最新の予定。
 * 日時、タイトル（訪問の予定では利用者とサービス内容）、予定の職員を出す。入力は消さず、職員が見比べて保存し直す（ADR-0026）。
 */
export const ScheduleLatestNotice = ({
  latest,
  staffList,
  patients,
}: ScheduleLatestNoticeProps) => {
  const staffName = staffList.find((staff) => staff.id === latest.staffId)?.name ?? ''
  const title =
    latest.kind === 'visit' && latest.visit !== undefined
      ? `${patients.find((p) => p.id === latest.visit?.patientId)?.name ?? ''}（${latest.visit.serviceCode}）`
      : latest.title || SCHEDULE_KIND_LABEL[latest.kind]
  return (
    <section
      className="mx-5 mt-4 rounded-8 bg-warning-surface px-4 py-3 text-body-dense"
      data-testid="schedule-edit-latest"
    >
      <h3 className="text-label text-warning">Google カレンダーの最新の予定</h3>
      <dl className="mt-2 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-text-secondary">日時</dt>
        <dd data-testid="schedule-edit-latest-datetime">
          {formatDateTimeRange(new Date(latest.startsAt), new Date(latest.endsAt))}
        </dd>
        <dt className="text-text-secondary">タイトル</dt>
        <dd data-testid="schedule-edit-latest-title">{title}</dd>
        <dt className="text-text-secondary">職員</dt>
        <dd data-testid="schedule-edit-latest-staff">{staffName}</dd>
      </dl>
      <p className="mt-2">
        入力はそのまま残しています。最新の予定と見比べて、もう一度保存してください。
      </p>
    </section>
  )
}
