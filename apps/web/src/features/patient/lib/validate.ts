import type { PatientInput } from '#/api/types'

/** 利用者の名前の、予定の API が受ける最大の文字数。 */
export const PATIENT_NAME_MAX_LENGTH = 255

/** 利用者の入力の欄の値。選んでいない欄は空の文字列にする。 */
export type PatientFormValues = {
  name: string
  serviceCodeId: string
  preferredTime: PatientInput['preferred_time'] | ''
  preferredGender: PatientInput['preferred_gender'] | ''
  assignedStaffId: string
}

/** 入力の欄ごとの誤りの文。誤りの無い欄は持たない。 */
export type PatientFormErrors = Partial<Record<keyof PatientFormValues, string>>

const MESSAGES: Record<keyof PatientFormValues, string> = {
  name: '名前を入れてください',
  serviceCodeId: 'サービスを選んでください',
  preferredTime: '希望の時間帯を選んでください',
  preferredGender: '希望する担当の性別を選んでください',
  assignedStaffId: '担当の職員を選んでください',
}

/**
 * 名前が空でないかと、選ぶ欄を選んだかを確認する。誤りがあれば欄ごとの文を、無ければ送る値を返す。
 * 名前は前後の空白を除いて送る。
 */
export const validatePatientForm = (
  values: PatientFormValues,
): { errors: PatientFormErrors } | { input: PatientInput } => {
  const name = values.name.trim()
  const errors: PatientFormErrors = {}
  if (name === '') errors.name = MESSAGES.name
  if (values.serviceCodeId === '') errors.serviceCodeId = MESSAGES.serviceCodeId
  if (values.preferredTime === '') errors.preferredTime = MESSAGES.preferredTime
  if (values.preferredGender === '') errors.preferredGender = MESSAGES.preferredGender
  if (values.assignedStaffId === '') errors.assignedStaffId = MESSAGES.assignedStaffId
  if (
    Object.keys(errors).length > 0 ||
    values.preferredTime === '' ||
    values.preferredGender === ''
  )
    return { errors }
  return {
    input: {
      name,
      service_code_id: values.serviceCodeId,
      preferred_time: values.preferredTime,
      preferred_gender: values.preferredGender,
      assigned_staff_id: values.assignedStaffId,
    },
  }
}
