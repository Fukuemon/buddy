import type { Staff } from '#/api/types'

import { OptionSearchSelectList } from './OptionSearchSelectList'

export type StaffSelectListProps = {
  staffList: Staff[]
  value: Staff['id']
  onChange: (staffId: Staff['id']) => void
}

/** 予定の担当者を 1 人選ぶ一覧。 */
export const StaffSelectList = ({ staffList, value, onChange }: StaffSelectListProps) => (
  <OptionSearchSelectList
    heading="担当者を選んでください"
    onChange={onChange}
    options={staffList}
    searchPlaceholder="職員を検索"
    testIdPrefix="staff-select"
    value={value}
  />
)
