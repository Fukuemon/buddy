import { ConfirmDialog, Loading } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { PatientRecord, PatientSchedules } from '#/api/types'

import { formatRemainingRecurring, formatRemainingSchedule, hasNoSchedules } from '../lib/format'

export type PatientEndDialogProps = {
  patient: PatientRecord
  /** 今日以降に残る予定。読み終えるまでは undefined にする。 */
  schedules?: PatientSchedules
  /** 残る予定を読めなかったときの文。 */
  schedulesError?: string
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <h3 className="text-label">{label}</h3>
    <ul className="flex flex-col gap-1 pl-4">{children}</ul>
  </div>
)

const RemainingList = ({
  schedules,
  errorMessage,
}: {
  schedules?: PatientSchedules
  errorMessage?: string
}) => {
  const testId = 'patient-end-schedules'
  if (errorMessage !== undefined)
    return (
      <p className="text-body text-danger" data-testid={testId} role="alert">
        {errorMessage}
      </p>
    )
  if (schedules === undefined)
    return (
      <div data-testid={testId}>
        <Loading description="読み込んでいます" />
      </div>
    )
  if (hasNoSchedules(schedules))
    return (
      <p className="text-body" data-testid={testId}>
        今日以降の予定は残っていません。
      </p>
    )
  return (
    <div
      className="flex max-h-64 flex-col gap-3 overflow-auto border-l-4 border-warning bg-warning-surface px-3 py-2 text-body"
      data-testid={testId}
    >
      <p>
        今日以降の予定が残っています。予定をキャンセルするか、繰り返しを終えてから、利用を終了してください。
      </p>
      {schedules.schedules.length > 0 && (
        <Group label={`予定（${schedules.schedules.length} 件）`}>
          {schedules.schedules.map((schedule) => (
            <li key={schedule.id}>
              <a
                className="text-primary underline underline-offset-4 focus-visible:focus-ring"
                data-testid={`patient-end-schedule-${schedule.id}`}
                href={`/schedule/${schedule.id}`}
              >
                {formatRemainingSchedule(schedule)}
              </a>
            </li>
          ))}
        </Group>
      )}
      {schedules.recurring_schedules.length > 0 && (
        <Group label={`繰り返しの予定（${schedules.recurring_schedules.length} 件）`}>
          {schedules.recurring_schedules.map((recurring) => (
            <li data-testid={`patient-end-recurring-${recurring.id}`} key={recurring.id}>
              {formatRemainingRecurring(recurring)}
            </li>
          ))}
        </Group>
      )}
    </div>
  )
}

/**
 * 利用者の利用を終了する前に、変わることと戻せることと、今日以降に残る予定を示す確認のダイアログ。
 * 残る予定が無いと読み終えたときだけ、利用を終了するを押せる。残る予定があれば、利用を終了できないことをタイトルで示す。
 * 利用の終了は利用の再開で戻せるので、確定のボタンを危険な操作の色にしない。
 */
export const PatientEndDialog = ({
  patient,
  schedules,
  schedulesError,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: PatientEndDialogProps) => {
  const refused = schedules !== undefined && !hasNoSchedules(schedules)
  return (
    <ConfirmDialog
      busyLabel="利用を終了しています"
      canSubmit={schedules !== undefined && !refused}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'patient-end-error' }
      }
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={onSubmit}
      submitLabel="利用を終了する"
      testIdPrefix="patient-end"
      title={
        refused ? `${patient.name} の利用を終了できません` : `${patient.name} の利用を終了しますか`
      }
    >
      <p className="text-body">
        {`利用を終了すると、${patient.name} は予定の利用者の候補と、利用者の一覧に、ふだんは出なくなります。過去の予定は残り、利用を再開すると同じ利用者として戻せます。`}
      </p>
      <RemainingList errorMessage={schedulesError} schedules={schedules} />
    </ConfirmDialog>
  )
}
