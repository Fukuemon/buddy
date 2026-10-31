import { Button } from '@buddy/ui'
import { useEffect, useRef, useState } from 'react'

import type { Department, StaffDetail, StaffUpdateInput, Team } from '#/api/types'
import { BusyLabel } from '#/components/site/BusyLabel'

import {
  STAFF_NAME_MAX_LENGTH,
  phoneNumberOf,
  validateName,
  validatePhone,
  type StaffFormErrors,
} from '../lib/validate'
import { StaffField, StaffSelect, sortByName, staffFieldClassName } from './StaffFormFields'

export type StaffProfileFormProps = {
  staff: StaffDetail
  /** 選択肢。読み終えるまでは undefined にする。 */
  departments?: readonly Department[]
  teams?: readonly Team[]
  isSubmitting: boolean
  /** 保存できなかったときの文。 */
  errorMessage?: string
  onSubmit: (input: StaffUpdateInput) => void
  onCancel: () => void
}

/**
 * 職員の基本の情報の枠を替える入力の欄。名前、電話番号、部署、チームを変え、メールアドレスは変えられないことを示す。
 * 保存を押すと入力を確認し、誤りがあれば送らずに欄の下に文を出す。開くと名前の欄にフォーカスを置く。
 */
export const StaffProfileForm = ({
  staff,
  departments,
  teams,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: StaffProfileFormProps) => {
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(staff.username)
  const [phone, setPhone] = useState(staff.phone_number ?? '')
  const [departmentId, setDepartmentId] = useState(staff.department.id)
  const [teamId, setTeamId] = useState(staff.team.id)
  const [errors, setErrors] = useState<StaffFormErrors>({})

  useEffect(() => nameRef.current?.focus(), [])

  const submit = () => {
    const next: StaffFormErrors = { name: validateName(name), phone: validatePhone(phone) }
    setErrors(next)
    if (Object.values(next).some((error) => error !== undefined)) return
    onSubmit({
      username: name.trim(),
      phone_number: phoneNumberOf(phone),
      department_id: departmentId,
      team_id: teamId,
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="staff-detail-profile-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <h2 className="text-heading-sm">基本の情報</h2>
      <StaffField error={errors.name} errorTestId="staff-detail-error-name" label="名前">
        {(field) => (
          <input
            {...field}
            className={staffFieldClassName}
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
      </StaffField>
      <div className="flex flex-col gap-1">
        <span className="text-label">メールアドレス</span>
        <span className="text-body break-all">{staff.email}</span>
        <span className="text-caption text-text-secondary">メールアドレスは変えられません。</span>
      </div>
      <StaffField
        error={errors.phone}
        errorTestId="staff-detail-error-phone"
        label="電話番号（任意）"
      >
        {(field) => (
          <input
            {...field}
            className={staffFieldClassName}
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
      </StaffField>
      <div className="flex flex-col gap-4 desktop:flex-row">
        <StaffField label="部署">
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
        </StaffField>
        <StaffField label="チーム">
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
        </StaffField>
      </div>
      <p className="text-caption text-text-secondary">
        チームを変えると、チームを対象にする権限のうち、今のチームを指すものは新しいチームを指します。
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {errorMessage !== undefined && (
          <p
            className="mr-auto border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
            data-testid="staff-detail-save-error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        <Button
          data-testid="staff-detail-edit-cancel"
          disabled={isSubmitting}
          onClick={onCancel}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid="staff-detail-save"
          disabled={isSubmitting || departments === undefined || teams === undefined}
          size="S"
          type="submit"
        >
          <BusyLabel busy={isSubmitting}>{isSubmitting ? '保存しています' : '保存'}</BusyLabel>
        </Button>
      </div>
    </form>
  )
}
