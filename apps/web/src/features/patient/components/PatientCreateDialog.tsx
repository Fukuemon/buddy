import { InputDialog } from '@buddy/ui'
import { useEffect, useId, useRef, useState } from 'react'

import type { PatientInput, ServiceCodeRecord } from '#/api/types'

import {
  validatePatientForm,
  type PatientFormErrors,
  type PatientFormValues,
} from '../lib/validate'
import { PatientFormFields, type StaffOption } from './PatientFormFields'

export type PatientCreateDialogProps = {
  /** 選択肢。読み終えるまでと、読めなかったときは undefined にする。 */
  serviceCodes?: readonly ServiceCodeRecord[]
  staffOptions?: readonly StaffOption[]
  isSubmitting: boolean
  /** 登録できなかったときと、選択肢を読めなかったときの文。 */
  errorMessage?: string
  onSubmit: (input: PatientInput) => void
  onClose: () => void
}

const EMPTY: PatientFormValues = {
  name: '',
  serviceCodeId: '',
  preferredTime: '',
  preferredGender: '',
  assignedStaffId: '',
}

/** 変わった欄の誤りの文だけを消す。 */
const clearChanged = (
  errors: PatientFormErrors,
  before: PatientFormValues,
  after: PatientFormValues,
): PatientFormErrors =>
  Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) => before[key as keyof PatientFormValues] === after[key as keyof PatientFormValues],
    ),
  )

/**
 * 利用者を登録するダイアログ。登録を押すと入力を確認し、誤りがあれば送らずに欄の下に文を出す。
 * 選ぶ欄は何も選ばずに始める。開くと名前の欄にフォーカスを置く。
 */
export const PatientCreateDialog = ({
  serviceCodes,
  staffOptions,
  isSubmitting,
  errorMessage,
  onSubmit,
  onClose,
}: PatientCreateDialogProps) => {
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<PatientFormErrors>({})

  // <dialog> の showModal は、最初の操作できる要素（閉じるボタン）にフォーカスを移す（HTML の dialog の focusing steps）。その後に名前の欄へ移す
  useEffect(() => nameRef.current?.focus(), [])

  const submit = () => {
    const result = validatePatientForm(values)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    onSubmit(result.input)
  }

  return (
    <InputDialog
      busyLabel="登録しています"
      canSubmit={serviceCodes !== undefined && staffOptions !== undefined}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'patient-new-submit-error' }
      }
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      submitLabel="登録"
      testIdPrefix="patient-new"
      title="利用者を登録"
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
        <PatientFormFields
          disabled={isSubmitting}
          errors={errors}
          nameRef={nameRef}
          onChange={(next) => {
            setErrors((current) => clearChanged(current, values, next))
            setValues(next)
          }}
          serviceCodes={serviceCodes}
          staffHint="休職と退職の職員は選べません。"
          staffOptions={staffOptions}
          testIds={{
            name: 'patient-new-name',
            service: 'patient-new-service',
            time: 'patient-new-time',
            gender: 'patient-new-gender',
            staff: 'patient-new-staff',
            error: 'patient-new-error',
          }}
          values={values}
        />
      </form>
    </InputDialog>
  )
}
