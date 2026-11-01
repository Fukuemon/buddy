import { InputDialog } from '@buddy/ui'
import { useEffect, useId, useRef, useState } from 'react'

import type { PatientInput, PatientRecord, ServiceCodeRecord } from '#/api/types'

import {
  validatePatientForm,
  type PatientFormErrors,
  type PatientFormValues,
} from '../lib/validate'
import { PatientFormFields, type StaffOption } from './PatientFormFields'

export type PatientEditDialogProps = {
  patient: PatientRecord
  /** 選択肢。読み終えるまでと、読めなかったときは undefined にする。 */
  serviceCodes?: readonly ServiceCodeRecord[]
  staffOptions?: readonly StaffOption[]
  isSubmitting: boolean
  /** 保存できなかったときと、選択肢を読めなかったときの文。 */
  errorMessage?: string
  onSubmit: (input: PatientInput) => void
  onClose: () => void
}

/**
 * 利用者の名前、サービス、希望、担当の職員を変えるダイアログ。今の値を入れて始め、開くと名前の欄にフォーカスを置く。
 * 保存を押すと入力を確認し、名前が空なら送らずに欄の下に文を出す。
 */
export const PatientEditDialog = ({
  patient,
  serviceCodes,
  staffOptions,
  isSubmitting,
  errorMessage,
  onSubmit,
  onClose,
}: PatientEditDialogProps) => {
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<PatientFormValues>({
    name: patient.name,
    serviceCodeId: patient.service_code_id,
    preferredTime: patient.preferred_time,
    preferredGender: patient.preferred_gender,
    assignedStaffId: patient.assigned_staff_id,
  })
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
      busyLabel="保存しています"
      canSubmit={serviceCodes !== undefined && staffOptions !== undefined}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'patient-detail-edit-error' }
      }
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      submitLabel="保存"
      submitTestId="patient-detail-save"
      testIdPrefix="patient-detail-edit"
      title="利用者を編集"
    >
      <form
        className="flex flex-col gap-4"
        data-testid="patient-detail-profile-form"
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
            if (next.name !== values.name) setErrors({})
            setValues(next)
          }}
          serviceCodes={serviceCodes}
          staffHint="休職と退職の職員は、新しく選べません。今の担当のままなら保存できます。"
          staffOptions={staffOptions}
          testIds={{
            name: 'patient-detail-name-input',
            service: 'patient-detail-service-input',
            time: 'patient-detail-time-input',
            gender: 'patient-detail-gender-input',
            staff: 'patient-detail-staff-input',
            error: 'patient-detail-error',
          }}
          values={values}
        />
      </form>
    </InputDialog>
  )
}
