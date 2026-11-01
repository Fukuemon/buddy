import { Loading } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { StaffAssignments } from '#/api/types'

import { formatRemainingRecurring, formatRemainingSchedule, hasNoAssignments } from '../lib/format'

export type StaffAssignmentListProps = {
  /** 休職、退職、訪問しない職員への変更で、見出しの文と testid の接頭辞（`staff-leave`、`staff-retire`、`staff-non-visiting`）を変える。 */
  kind: 'leave' | 'retire' | 'non-visiting'
  /** 読み終えるまでは undefined にする。 */
  assignments?: StaffAssignments
  /** 読めなかったときの文。 */
  errorMessage?: string
}

const LEAD: Record<StaffAssignmentListProps['kind'], string> = {
  leave:
    '今日以降の予定と担当の利用者が残っています。休職の間は誰も行かないので、必要なら別の職員に割り振り直してください。',
  retire:
    '今日以降の予定と担当の利用者が残っています。別の職員に割り振り直してから、退職にしてください。',
  'non-visiting':
    '今日以降の予定と担当の利用者が残っています。別の職員に割り振り直してから、訪問しない職員にしてください。',
}

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <h3 className="text-label">{label}</h3>
    <ul className="flex flex-col gap-1 pl-4">{children}</ul>
  </div>
)

/**
 * 休職か退職か訪問しない職員にする職員に、今日以降に残る予定、繰り返しの予定、担当の利用者を示す。
 * 予定は予定の詳細へのリンクにする。件数が 0 のまとまりは省き、3 つとも 0 件なら残っていないことを示す。
 */
export const StaffAssignmentList = ({
  kind,
  assignments,
  errorMessage,
}: StaffAssignmentListProps) => {
  const testId = `staff-${kind}-assignments`
  if (errorMessage !== undefined)
    return (
      <p className="text-body text-danger" data-testid={testId} role="alert">
        {errorMessage}
      </p>
    )
  if (assignments === undefined)
    return (
      <div data-testid={testId}>
        <Loading description="読み込んでいます" />
      </div>
    )
  if (hasNoAssignments(assignments))
    return (
      <p className="text-body" data-testid={testId}>
        今日以降の予定と担当の利用者は残っていません。
      </p>
    )
  return (
    <div
      className="flex max-h-64 flex-col gap-3 overflow-auto border-l-4 border-warning bg-warning-surface px-3 py-2 text-body"
      data-testid={testId}
    >
      <p>{LEAD[kind]}</p>
      {assignments.schedules.length > 0 && (
        <Group label={`予定（${assignments.schedules.length} 件）`}>
          {assignments.schedules.map((schedule) => (
            <li key={schedule.id}>
              <a
                className="text-primary underline underline-offset-4 focus-visible:focus-ring"
                data-testid={`staff-${kind}-assignment-schedule-${schedule.id}`}
                href={`/schedule/${schedule.id}`}
              >
                {formatRemainingSchedule(schedule)}
              </a>
            </li>
          ))}
        </Group>
      )}
      {assignments.recurring_schedules.length > 0 && (
        <Group label={`繰り返しの予定（${assignments.recurring_schedules.length} 件）`}>
          {assignments.recurring_schedules.map((recurring) => (
            <li
              data-testid={`staff-${kind}-assignment-recurring-${recurring.id}`}
              key={recurring.id}
            >
              {formatRemainingRecurring(recurring)}
            </li>
          ))}
        </Group>
      )}
      {assignments.patients.length > 0 && (
        <Group label={`担当の利用者（${assignments.patients.length} 人）`}>
          {assignments.patients.map((patient) => (
            <li data-testid={`staff-${kind}-assignment-patient-${patient.id}`} key={patient.id}>
              {patient.name}
            </li>
          ))}
        </Group>
      )}
    </div>
  )
}
