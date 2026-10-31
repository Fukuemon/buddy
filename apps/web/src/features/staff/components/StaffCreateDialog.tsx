import { Button } from '@buddy/ui'
import { useEffect, useId, useRef, useState } from 'react'

import type { Department, Position, StaffCreateInput, Team } from '#/api/types'
import { BusyLabel } from '#/components/site/BusyLabel'
import { SiteDialog } from '#/components/site/SiteDialog'

import {
  STAFF_NAME_MAX_LENGTH,
  phoneNumberOf,
  validateEmail,
  validateName,
  validatePhone,
  type StaffFormErrors,
} from '../lib/validate'
import { StaffField, StaffSelect, sortByName, staffFieldClassName } from './StaffFormFields'

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
 * 部署、チーム、役職は、名前の順の最初のものを選んで始める。開くと名前の欄にフォーカスを置く。
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
  const titleId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [errors, setErrors] = useState<StaffFormErrors>({})

  const departmentOptions = sortByName(departments)
  const teamOptions = sortByName(teams)
  const positionOptions = sortByName(positions)
  const selectedDepartment = departmentId || departmentOptions?.[0]?.id || ''
  const selectedTeam = teamId || teamOptions?.[0]?.id || ''
  const selectedPosition = positionId || positionOptions?.[0]?.id || ''

  // <dialog> の showModal は、最初の操作できる要素（閉じるボタン）にフォーカスを移す（HTML の dialog の focusing steps）。その後に名前の欄へ移す
  useEffect(() => nameRef.current?.focus(), [])

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
      phone_number: phoneNumberOf(phone),
      department_id: selectedDepartment,
      team_id: selectedTeam,
      position_id: selectedPosition,
    })
  }

  return (
    <SiteDialog
      canClose={!isSubmitting}
      data-testid="staff-new-dialog"
      labelledBy={titleId}
      onClose={onClose}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-heading-sm" id={titleId}>
          職員を登録
        </h2>
        <button
          aria-disabled={isSubmitting || undefined}
          aria-label="閉じる"
          className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring aria-disabled:text-text-disabled"
          data-testid="staff-new-close"
          onClick={() => {
            if (!isSubmitting) onClose()
          }}
          type="button"
        >
          <svg aria-hidden height="20" viewBox="0 0 20 20" width="20">
            <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
      <form
        className="flex flex-col gap-4"
        id={`${titleId}-form`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <StaffField errorTestId="staff-new-error-name" error={errors.name} label="名前">
          {(field) => (
            <input
              {...field}
              className={staffFieldClassName}
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
        </StaffField>
        <StaffField
          error={errors.email}
          errorTestId="staff-new-error-email"
          hint="職員が事業所の IdP でログインするときのメールアドレス。登録した後は変えられません。"
          label="メールアドレス"
        >
          {(field) => (
            <input
              {...field}
              autoComplete="off"
              className={staffFieldClassName}
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
        </StaffField>
        <StaffField
          errorTestId="staff-new-error-phone"
          error={errors.phone}
          label="電話番号（任意）"
        >
          {(field) => (
            <input
              {...field}
              className={staffFieldClassName}
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
        </StaffField>
        <div className="flex flex-col gap-4 desktop:flex-row">
          <StaffField label="部署">
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
          </StaffField>
          <StaffField label="チーム">
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
          </StaffField>
          <StaffField label="役職">
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
          </StaffField>
        </div>
        <p className="text-body">
          登録すると、役職のデフォルトの権限が付きます。職員は、このメールアドレスで最初にログインしたときから使えます。
        </p>
      </form>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {errorMessage !== undefined && (
          <p
            className="mr-auto border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
            data-testid="staff-new-submit-error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        <Button
          data-testid="staff-new-cancel"
          disabled={isSubmitting}
          onClick={onClose}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid="staff-new-submit"
          disabled={
            isSubmitting ||
            departments === undefined ||
            teams === undefined ||
            positions === undefined
          }
          form={`${titleId}-form`}
          size="S"
          type="submit"
        >
          <BusyLabel busy={isSubmitting}>{isSubmitting ? '登録しています' : '登録'}</BusyLabel>
        </Button>
      </div>
    </SiteDialog>
  )
}
