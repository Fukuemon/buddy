import type { Staff } from '#/api/types'

import { OptionSearchSelectList } from './OptionSearchSelectList'

export type StaffSelectListProps = {
  staffList: Staff[]
  value: Staff['id']
  onChange: (staffId: Staff['id']) => void
  /** 一覧の見出し。訪問の予定では「主訪問者を選んでください」、通常の予定では「予定者を選んでください」にする。 */
  heading: string
}

/** 予定の職員（訪問の予定では主訪問者、通常の予定では予定者）を 1 人選ぶ一覧。 */
export const StaffSelectList = ({ staffList, value, onChange, heading }: StaffSelectListProps) => (
  <OptionSearchSelectList
    heading={heading}
    onChange={onChange}
    options={staffList}
    searchPlaceholder="職員を検索"
    testIdPrefix="staff-select"
    value={value}
  />
)
