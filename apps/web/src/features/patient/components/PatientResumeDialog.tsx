import { ConfirmDialog, FormField, formFieldControlClassName } from '@buddy/ui'
import { useState } from 'react'

import type { PatientRecord, StaffRecord } from '#/api/types'

export type PatientResumeDialogProps = {
  patient: PatientRecord
  /** 再開の担当に選べる有効な職員。読み終えるまでは undefined にする。 */
  staffOptions?: readonly StaffRecord[]
  /** 今の担当の職員の在籍の状態。休職か退職なら、選び直す理由を出す。 */
  currentStaffStatus?: StaffRecord['status']
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (assignedStaffId: string) => void
  onCancel: () => void
}

/**
 * 利用の終了の利用者を利用中に戻す前に、担当の職員を決め直す確認のダイアログ。
 * 今の担当が有効ならその職員を選んで始め、休職か退職なら何も選ばずに始めて理由を出す。担当を選ぶまで再開を押せない。
 */
export const PatientResumeDialog = ({
  patient,
  staffOptions,
  currentStaffStatus,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: PatientResumeDialogProps) => {
  const isCurrentStopped = currentStaffStatus === 'on_leave' || currentStaffStatus === 'retired'
  const [staffId, setStaffId] = useState(isCurrentStopped ? '' : patient.assigned_staff_id)
  const note = isCurrentStopped
    ? `今の担当の ${patient.assigned_staff_name} は${currentStaffStatus === 'on_leave' ? '休職' : '退職'}しています。担当の職員を選んでください。`
    : undefined
  return (
    <ConfirmDialog
      busyLabel="再開しています"
      canSubmit={staffId !== '' && staffOptions !== undefined}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'patient-resume-error' }
      }
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={() => onSubmit(staffId)}
      submitLabel="利用を再開する"
      testIdPrefix="patient-resume"
      title={`${patient.name} の利用を再開しますか`}
    >
      <p className="text-body">
        予定の利用者の候補と、利用者の一覧に戻ります。利用の終了の前の予定は、同じ利用者の予定のまま残ります。
      </p>
      <FormField
        hint={note && <span data-testid="patient-resume-staff-note">{note}</span>}
        label="担当の職員"
      >
        {(field) => (
          <select
            {...field}
            className={formFieldControlClassName}
            data-testid="patient-resume-staff"
            disabled={isSubmitting || staffOptions === undefined}
            onChange={(event) => setStaffId(event.target.value)}
            value={staffId}
          >
            <option disabled value="">
              選んでください
            </option>
            {staffOptions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.username}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </ConfirmDialog>
  )
}
