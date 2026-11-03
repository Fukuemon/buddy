import { FormField, formFieldControlClassName, InputDialog } from '@buddy/ui'
import { useId, useRef, useState } from 'react'

import type { Department, StaffAssignments, StaffDetail, StaffUpdateInput, Team } from '#/api/types'

import {
  STAFF_NAME_MAX_LENGTH,
  phoneNumberOf,
  validateName,
  validatePhone,
  type StaffFormErrors,
} from '../lib/validate'
import { StaffAssignmentList } from './StaffAssignmentList'
import { StaffSelect, sortByName } from './StaffFormFields'
import { VisitsField } from './VisitsField'

export type StaffProfileDialogProps = {
  staff: StaffDetail
  /** 選択肢。読み終えるまでは undefined にする。 */
  departments?: readonly Department[]
  teams?: readonly Team[]
  isSubmitting: boolean
  /** 保存できなかったときの文。 */
  errorMessage?: string
  /** 訪問しない職員に変えようとして拒まれたときの、今日以降に残る予定と担当の利用者。 */
  refusedAssignments?: StaffAssignments
  onSubmit: (input: StaffUpdateInput) => void
  onClose: () => void
}

/**
 * 職員の名前、電話番号、部署、チーム、訪問するかを変える入力のダイアログ。メールアドレスは変えられないことを示す。
 * 訪問しない職員に変えようとして、今日以降の予定か担当の利用者が残って拒まれたときは、残るものを訪問の欄の下に示す。
 * 保存を押すと入力を確認し、誤りがあれば送らずに欄の下に文を出す。開くと名前の欄にフォーカスを置く。
 */
export const StaffProfileDialog = ({
  staff,
  departments,
  teams,
  isSubmitting,
  errorMessage,
  refusedAssignments,
  onSubmit,
  onClose,
}: StaffProfileDialogProps) => {
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(staff.username)
  const [phone, setPhone] = useState(staff.phone_number ?? '')
  const [departmentId, setDepartmentId] = useState(staff.department.id)
  const [teamId, setTeamId] = useState(staff.team.id)
  const [visits, setVisits] = useState(staff.visits)
  const [errors, setErrors] = useState<StaffFormErrors>({})

  const submit = () => {
    const next: StaffFormErrors = { name: validateName(name), phone: validatePhone(phone) }
    setErrors(next)
    if (Object.values(next).some((error) => error !== undefined)) return
    onSubmit({
      username: name.trim(),
      phone_number: phoneNumberOf(phone),
      department_id: departmentId,
      team_id: teamId,
      visits,
    })
  }

  return (
    <InputDialog
      initialFocusRef={nameRef}
      busyLabel="保存しています"
      canSubmit={departments !== undefined && teams !== undefined}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'staff-detail-save-error' }
      }
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      submitLabel="保存"
      submitTestId="staff-detail-save"
      testIdPrefix="staff-detail-edit"
      title="プロフィールを編集"
    >
      <form
        className="flex flex-col gap-4"
        data-testid="staff-detail-profile-form"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FormField error={errors.name} errorTestId="staff-detail-error-name" label="名前">
          {(field) => (
            <input
              {...field}
              className={formFieldControlClassName}
              data-testid="staff-detail-name-input"
              disabled={isSubmitting}
              maxLength={STAFF_NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value)
                setErrors((current) => ({ ...current, name: undefined }))
              }}
              ref={nameRef}
              value={name}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-3">
          <span className="text-label">メールアドレス</span>
          <span className="text-body break-all" data-testid="staff-detail-email-readonly">
            {staff.email}
          </span>
          <span className="text-caption text-text-secondary">メールアドレスは変えられません。</span>
        </div>
        <FormField
          error={errors.phone}
          errorTestId="staff-detail-error-phone"
          label="電話番号（任意）"
        >
          {(field) => (
            <input
              {...field}
              className={formFieldControlClassName}
              data-testid="staff-detail-phone-input"
              disabled={isSubmitting}
              inputMode="tel"
              onChange={(event) => {
                setPhone(event.target.value)
                setErrors((current) => ({ ...current, phone: undefined }))
              }}
              type="tel"
              value={phone}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-4 desktop:flex-row">
          <FormField label="部署">
            {(field) => (
              <StaffSelect
                {...field}
                data-testid="staff-detail-department-input"
                disabled={isSubmitting}
                onChange={(event) => setDepartmentId(event.target.value)}
                options={sortByName(departments)}
                value={departmentId}
              />
            )}
          </FormField>
          <FormField
            hint="チームを変えると、今のチームを対象にしている権限は、新しいチームが対象になります。"
            label="チーム"
          >
            {(field) => (
              <StaffSelect
                {...field}
                data-testid="staff-detail-team-input"
                disabled={isSubmitting}
                onChange={(event) => setTeamId(event.target.value)}
                options={sortByName(teams)}
                value={teamId}
              />
            )}
          </FormField>
        </div>
        <VisitsField onChange={setVisits} testId="staff-detail-visits-input" value={visits} />
        {refusedAssignments !== undefined && !visits && (
          <StaffAssignmentList assignments={refusedAssignments} kind="non-visiting" />
        )}
      </form>
    </InputDialog>
  )
}
