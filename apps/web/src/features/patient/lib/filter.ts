import type { PatientRecord } from '#/api/types'

/** 状態の絞り込みの値。all は、利用の終了を含む全ての利用者である。 */
export type PatientStatusFilter = 'active' | 'ended' | 'all'

/** 状態の絞り込みの選択肢。並びは画面の並びである。 */
export const STATUS_FILTER_OPTIONS: readonly { value: PatientStatusFilter; label: string }[] = [
  { value: 'active', label: '利用中' },
  { value: 'ended', label: '利用の終了' },
  { value: 'all', label: 'すべて' },
]

/** 利用者の一覧の絞り込み。担当の職員は、空なら「すべて」である。 */
export type PatientListFilter = {
  name: string
  staffId: string
  status: PatientStatusFilter
}

/** 開いた直後と、絞り込みを外したときの値。 */
export const DEFAULT_PATIENT_LIST_FILTER: PatientListFilter = {
  name: '',
  staffId: '',
  status: 'active',
}

const withoutSpaces = (value: string) => value.replace(/\s/g, '')

/** 名前の一部（空白の違いは無視する）、担当の職員、状態の全てを満たす利用者を、名前の順で返す。 */
export const filterPatients = (patients: readonly PatientRecord[], filter: PatientListFilter) => {
  const name = withoutSpaces(filter.name)
  return patients
    .filter(
      (p) =>
        withoutSpaces(p.name).includes(name) &&
        (filter.staffId === '' || p.assigned_staff_id === filter.staffId) &&
        (filter.status === 'all' || (filter.status === 'ended') === (p.ended_at !== null)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

/** 担当の職員の絞り込みの選択肢。読んだ利用者の担当の職員を、重ねずに名前の順で返す。 */
export const assignedStaffOptions = (patients: readonly PatientRecord[]) =>
  [...new Map(patients.map((p) => [p.assigned_staff_id, p.assigned_staff_name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
