import { ConfirmDialog, FormField, Select } from '@buddy/ui'
import { useState } from 'react'

import type { PatientRecord, StaffRecord } from '#/api/types'

/** 今の担当を再開の担当に選べない理由。選べるか、職員を読み終える前なら undefined を返す。 */
const currentStaffNote = (name: string, staff: StaffRecord | undefined) => {
  if (staff?.status === 'on_leave')
    return `今の担当の ${name} は休職しています。担当の職員を選んでください。`
  if (staff?.status === 'retired')
    return `今の担当の ${name} は退職しています。担当の職員を選んでください。`
  if (staff?.visits === false)
    return `今の担当の ${name} は訪問しない職員です。担当の職員を選んでください。`
  return undefined
}

export type PatientResumeDialogProps = {
  patient: PatientRecord
  /** 再開の担当に選べる有効な職員。読み終えるまでは undefined にする。 */
  staffOptions?: readonly StaffRecord[]
  /** 今の担当の職員。休職か退職か訪問しない職員なら、選び直す理由を出す。読み終えるまでは undefined にする。 */
  currentStaff?: StaffRecord
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (assignedStaffId: string) => void
  onCancel: () => void
}

/**
 * 利用の終了の利用者を利用中に戻す前に、担当の職員を決め直す確認のダイアログ。
 * 今の担当が選択肢にあればその職員を選んで始め、休職か退職か訪問しない職員なら何も選ばずに始めて理由を出す。
 * 選択肢を読み終える前は何も選ばない。担当を選ぶまで再開を押せない。
 */
export const PatientResumeDialog = ({
  patient,
  staffOptions,
  currentStaff,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: PatientResumeDialogProps) => {
  const [selected, setSelected] = useState<string>()
  const isCurrentSelectable = staffOptions?.some((s) => s.id === patient.assigned_staff_id) ?? false
  const staffId = selected ?? (isCurrentSelectable ? patient.assigned_staff_id : '')
  const note = currentStaffNote(patient.assigned_staff_name, currentStaff)
  return (
    <ConfirmDialog
      busyLabel="再開しています"
      canSubmit={staffId !== '' && staffOptions !== undefined}
      submitHint={staffOptions === undefined ? undefined : '担当の職員を選んでください。'}
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
          <Select
            {...field}
            data-testid="patient-resume-staff"
            disabled={isSubmitting || staffOptions === undefined}
            onChange={(event) => setSelected(event.target.value)}
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
          </Select>
        )}
      </FormField>
    </ConfirmDialog>
  )
}
