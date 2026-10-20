import type { Patient } from '#/api/types'

import { OptionSearchSelectList } from './OptionSearchSelectList'

export type PatientSelectListProps = {
  patients: Patient[]
  value: Patient['id']
  onChange: (patientId: Patient['id']) => void
}

/** 訪問先の利用者を 1 人選ぶ一覧。 */
export const PatientSelectList = ({ patients, value, onChange }: PatientSelectListProps) => (
  <OptionSearchSelectList
    heading="利用者を選んでください"
    onChange={onChange}
    options={patients}
    searchPlaceholder="利用者を検索"
    testIdPrefix="patient-select"
    value={value}
  />
)
