import type { StaffRecord } from '#/api/types'

/** 状態の絞り込みの値。enrolled は在籍（有効と休職）、all は退職を含む全ての職員である。 */
export type StaffStatusFilter = 'enrolled' | 'active' | 'on_leave' | 'retired' | 'all'

/** 状態の絞り込みの選択肢。並びは画面の並びである。 */
export const STATUS_FILTER_OPTIONS: readonly { value: StaffStatusFilter; label: string }[] = [
  { value: 'enrolled', label: '在籍' },
  { value: 'active', label: '有効' },
  { value: 'on_leave', label: '休職' },
  { value: 'retired', label: '退職' },
  { value: 'all', label: 'すべて' },
]

/** 職員の一覧の絞り込み。部署、チーム、役職は、空なら「すべて」である。 */
export type StaffListFilter = {
  name: string
  departmentId: string
  teamId: string
  positionId: string
  status: StaffStatusFilter
}

/** 開いた直後と、絞り込みを外したときの値。 */
export const DEFAULT_STAFF_LIST_FILTER: StaffListFilter = {
  name: '',
  departmentId: '',
  teamId: '',
  positionId: '',
  status: 'enrolled',
}

const withoutSpaces = (value: string) => value.replace(/\s/g, '')

const matchesStatus = (staff: StaffRecord, status: StaffStatusFilter) => {
  if (status === 'all') return true
  if (status === 'enrolled') return staff.status !== 'retired'
  return staff.status === status
}

/** 名前の一部（空白の違いは無視する）、部署、チーム、役職、状態の全てを満たす職員を、並びを変えずに返す。 */
export const filterStaff = (staff: readonly StaffRecord[], filter: StaffListFilter) => {
  const name = withoutSpaces(filter.name)
  return staff.filter(
    (s) =>
      withoutSpaces(s.username).includes(name) &&
      (filter.departmentId === '' || s.department.id === filter.departmentId) &&
      (filter.teamId === '' || s.team.id === filter.teamId) &&
      (filter.positionId === '' || s.position.id === filter.positionId) &&
      matchesStatus(s, filter.status),
  )
}
