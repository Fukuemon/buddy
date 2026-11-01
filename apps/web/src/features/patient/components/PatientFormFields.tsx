import { FormField, formFieldControlClassName, type FormFieldControlProps } from '@buddy/ui'
import { useId, type ReactNode, type Ref } from 'react'

import type { PatientInput, ServiceCodeRecord } from '#/api/types'

import { serviceCodeLabel } from '../lib/format'
import {
  PATIENT_NAME_MAX_LENGTH,
  type PatientFormErrors,
  type PatientFormValues,
} from '../lib/validate'

/** 担当の職員の選択肢 1 つ。label は、休職か退職の今の担当では状態を添えた名前にする。 */
export type StaffOption = { id: string; label: string }

/** 欄ごとの testid。登録と編集で、画面仕様書のモックの testid が違う。 */
export type PatientFieldTestIds = {
  name: string
  service: string
  time: string
  gender: string
  staff: string
  /** 誤りの文の testid の接頭辞。`<接頭辞>-name` のように欄の名前を付ける。 */
  error: string
}

export type PatientFormFieldsProps = {
  values: PatientFormValues
  errors: PatientFormErrors
  onChange: (values: PatientFormValues) => void
  /** サービスの選択肢。読み終えるまでは undefined にし、選択の欄を押せなくする。 */
  serviceCodes?: readonly ServiceCodeRecord[]
  /** 担当の職員の選択肢。読み終えるまでは undefined にし、選択の欄を押せなくする。 */
  staffOptions?: readonly StaffOption[]
  /** 担当の職員の選択の下に常に出す文。 */
  staffHint: string
  disabled: boolean
  testIds: PatientFieldTestIds
  nameRef?: Ref<HTMLInputElement>
}

const TIMES: readonly { value: PatientInput['preferred_time']; id: string }[] = [
  { value: '午前', id: 'morning' },
  { value: '午後', id: 'afternoon' },
]
const GENDERS: readonly { value: PatientInput['preferred_gender']; id: string }[] = [
  { value: '男性', id: 'male' },
  { value: '女性', id: 'female' },
]

const radioClassName =
  'flex min-h-11 min-w-24 items-center gap-2 rounded-8 px-3 text-body ring-1 ring-border-field ring-inset has-checked:ring-2 has-checked:ring-primary has-disabled:text-text-disabled has-[:focus-visible]:focus-ring'

const RadioRow = <T extends string>({
  field,
  options,
  value,
  onChange,
  disabled,
  testId,
}: {
  field: FormFieldControlProps
  options: readonly { value: T; id: string }[]
  value: T | ''
  onChange: (value: T) => void
  disabled: boolean
  testId: string
}) => {
  const name = useId()
  return (
    <div {...field} className="flex flex-wrap gap-2" data-testid={testId} role="radiogroup">
      {options.map((option) => (
        <label className={radioClassName} key={option.id}>
          <input
            checked={value === option.value}
            data-testid={`${testId}-${option.id}`}
            disabled={disabled}
            name={name}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          {option.value}
        </label>
      ))}
    </div>
  )
}

const Select = ({
  field,
  testId,
  value,
  onChange,
  disabled,
  children,
}: {
  field: FormFieldControlProps
  testId: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  children: ReactNode
}) => (
  <select
    {...field}
    className={formFieldControlClassName}
    data-testid={testId}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    value={value}
  >
    <option disabled value="">
      選んでください
    </option>
    {children}
  </select>
)

/**
 * 利用者の登録と編集のダイアログの入力の欄。名前、サービス、希望の時間帯、希望する担当の性別、担当の職員を縦に並べる。
 * 値と誤りの文は呼ぶ側が持つ。欄を変えると、変えた後の全ての値で onChange を呼ぶ。
 */
export const PatientFormFields = ({
  values,
  errors,
  onChange,
  serviceCodes,
  staffOptions,
  staffHint,
  disabled,
  testIds,
  nameRef,
}: PatientFormFieldsProps) => {
  const set = <K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) =>
    onChange({ ...values, [key]: value })
  return (
    <>
      <FormField error={errors.name} errorTestId={`${testIds.error}-name`} label="名前">
        {(field) => (
          <input
            {...field}
            className={formFieldControlClassName}
            data-testid={testIds.name}
            disabled={disabled}
            maxLength={PATIENT_NAME_MAX_LENGTH}
            onChange={(event) => set('name', event.target.value)}
            ref={nameRef}
            value={values.name}
          />
        )}
      </FormField>
      <FormField
        error={errors.serviceCodeId}
        errorTestId={`${testIds.error}-service`}
        label="サービス"
      >
        {(field) => (
          <Select
            disabled={disabled || serviceCodes === undefined}
            field={field}
            onChange={(value) => set('serviceCodeId', value)}
            testId={testIds.service}
            value={values.serviceCodeId}
          >
            {serviceCodes?.map((code) => (
              <option key={code.id} value={code.id}>
                {serviceCodeLabel(code)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div className="flex flex-col gap-4 desktop:flex-row">
        <FormField
          error={errors.preferredTime}
          errorTestId={`${testIds.error}-time`}
          isGroup
          label="希望の時間帯"
        >
          {(field) => (
            <RadioRow
              disabled={disabled}
              field={field}
              onChange={(value) => set('preferredTime', value)}
              options={TIMES}
              testId={testIds.time}
              value={values.preferredTime}
            />
          )}
        </FormField>
        <FormField
          error={errors.preferredGender}
          errorTestId={`${testIds.error}-gender`}
          isGroup
          label="希望する担当の性別"
        >
          {(field) => (
            <RadioRow
              disabled={disabled}
              field={field}
              onChange={(value) => set('preferredGender', value)}
              options={GENDERS}
              testId={testIds.gender}
              value={values.preferredGender}
            />
          )}
        </FormField>
      </div>
      <FormField
        error={errors.assignedStaffId}
        errorTestId={`${testIds.error}-staff`}
        hint={staffHint}
        label="担当の職員"
      >
        {(field) => (
          <Select
            disabled={disabled || staffOptions === undefined}
            field={field}
            onChange={(value) => set('assignedStaffId', value)}
            testId={testIds.staff}
            value={values.assignedStaffId}
          >
            {staffOptions?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
    </>
  )
}
