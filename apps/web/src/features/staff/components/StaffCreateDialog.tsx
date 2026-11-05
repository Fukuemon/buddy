import { FormField, formFieldControlClassName, HelpToggle, InputDialog } from '@buddy/ui'
import { useId, useRef, useState } from 'react'

import type { Department, Position, StaffCreateInput, Team } from '#/api/types'

import {
  STAFF_NAME_MAX_LENGTH,
  phoneNumberOf,
  validateEmail,
  validateName,
  validatePhone,
  type StaffFormErrors,
} from '../lib/validate'
import { StaffSelect, sortByName } from './StaffFormFields'
import { VisitsField } from './VisitsField'

export type StaffCreateDialogProps = {
  /** 選択肢。読み終えるまでは undefined にする。 */
  departments?: readonly Department[]
  teams?: readonly Team[]
  positions?: readonly Position[]
  isSubmitting: boolean
  /** 登録できなかったときと、選択肢を読めなかったときの文。 */
  errorMessage?: string
  onSubmit: (input: StaffCreateInput) => void
  onClose: () => void
}

/**
 * 職員を登録するダイアログ。登録を押すと入力を確認し、誤りがあれば送らずに欄の下に文を出す。
 * 部署、チーム、役職は、名前の順の最初のものを選んで始める。訪問するかは「訪問する」で始め、役職からは決めない（ADR-0018）。
 * 開くと名前の欄にフォーカスを置く。
 */
export const StaffCreateDialog = ({
  departments,
  teams,
  positions,
  isSubmitting,
  errorMessage,
  onSubmit,
  onClose,
}: StaffCreateDialogProps) => {
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [visits, setVisits] = useState(true)
  const [errors, setErrors] = useState<StaffFormErrors>({})

  const departmentOptions = sortByName(departments)
  const teamOptions = sortByName(teams)
  const positionOptions = sortByName(positions)
  const selectedDepartment = departmentId || departmentOptions?.[0]?.id || ''
  const selectedTeam = teamId || teamOptions?.[0]?.id || ''
  const selectedPosition = positionId || positionOptions?.[0]?.id || ''

  const submit = () => {
    const next: StaffFormErrors = {
      name: validateName(name),
      email: validateEmail(email),
      phone: validatePhone(phone),
    }
    setErrors(next)
    if (Object.values(next).some((error) => error !== undefined)) return
    onSubmit({
      username: name.trim(),
      email: email.trim(),
      ...(phoneNumberOf(phone) !== null && { phone_number: phoneNumberOf(phone) }),
      department_id: selectedDepartment,
      team_id: selectedTeam,
      position_id: selectedPosition,
      visits,
    })
  }

  return (
    <InputDialog
      initialFocusRef={nameRef}
      busyLabel="登録しています"
      canSubmit={departments !== undefined && teams !== undefined && positions !== undefined}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'staff-new-submit-error' }
      }
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      submitLabel="登録"
      testIdPrefix="staff-new"
      title="職員を登録"
      titleAddon={
        <HelpToggle data-testid="staff-new-help">
          登録した職員は、このメールアドレスで最初にログインしたときから使えます。
        </HelpToggle>
      }
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FormField errorTestId="staff-new-error-name" error={errors.name} label="名前">
          {(field) => (
            <input
              {...field}
              className={formFieldControlClassName}
              data-testid="staff-new-name"
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
        <FormField
          error={errors.email}
          errorTestId="staff-new-error-email"
          hint="ログインに使うメールアドレス。登録した後は変えられません。"
          label="メールアドレス"
        >
          {(field) => (
            <input
              {...field}
              autoComplete="off"
              className={formFieldControlClassName}
              data-testid="staff-new-email"
              disabled={isSubmitting}
              onChange={(event) => {
                setEmail(event.target.value)
                setErrors((current) => ({ ...current, email: undefined }))
              }}
              type="email"
              value={email}
            />
          )}
        </FormField>
        <FormField
          errorTestId="staff-new-error-phone"
          error={errors.phone}
          label="電話番号（任意）"
        >
          {(field) => (
            <input
              {...field}
              className={formFieldControlClassName}
              data-testid="staff-new-phone"
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
                data-testid="staff-new-department"
                disabled={isSubmitting}
                onChange={(event) => setDepartmentId(event.target.value)}
                options={departmentOptions}
                value={selectedDepartment}
              />
            )}
          </FormField>
          <FormField label="チーム">
            {(field) => (
              <StaffSelect
                {...field}
                data-testid="staff-new-team"
                disabled={isSubmitting}
                onChange={(event) => setTeamId(event.target.value)}
                options={teamOptions}
                value={selectedTeam}
              />
            )}
          </FormField>
          <FormField hint="役職で権限が決まります。" label="役職">
            {(field) => (
              <StaffSelect
                {...field}
                data-testid="staff-new-position"
                disabled={isSubmitting}
                onChange={(event) => setPositionId(event.target.value)}
                options={positionOptions}
                value={selectedPosition}
              />
            )}
          </FormField>
        </div>
        <VisitsField onChange={setVisits} testId="staff-new-visits" value={visits} />
      </form>
    </InputDialog>
  )
}
