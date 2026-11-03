import type { StaffRecord, Team } from '#/api/types'

/** 状態の絞り込みの値。all は、休職と退職を含む全ての職員である。 */
export type StaffStatusFilter = 'active' | 'on_leave' | 'retired' | 'all'

/** 状態の絞り込みの選択肢。並びは画面の並びである。 */
export const STATUS_FILTER_OPTIONS: readonly { value: StaffStatusFilter; label: string }[] = [
  { value: 'active', label: '有効' },
  { value: 'on_leave', label: '休職' },
  { value: 'retired', label: '退職' },
  { value: 'all', label: 'すべて' },
]

/** 職員の一覧の絞り込み。チーム、役職、部署は、空なら「すべて」である。 */
export type StaffListFilter = {
  name: string
  teamId: string
  positionId: string
  departmentId: string
  status: StaffStatusFilter
}

/** 開いた直後と、絞り込みを外したときの値。 */
export const DEFAULT_STAFF_LIST_FILTER: StaffListFilter = {
  name: '',
  teamId: '',
  positionId: '',
  departmentId: '',
  status: 'active',
}

const withoutSpaces = (value: string) => value.replace(/\s/g, '')

/**
 * 名前の一部（空白の違いは無視する）、チーム、役職、部署、状態の全てを満たす職員を返す。
 * 並びは、teams の名前の順のチームの順にし、同じチームの中は名前の順にする。teams に無いチームの職員は最後に置く。
 */
export const filterStaff = (
  staffList: readonly StaffRecord[],
  filter: StaffListFilter,
  teams: readonly Team[] = [],
) => {
  const name = withoutSpaces(filter.name)
  const teamOrder = new Map(
    [...teams].sort((a, b) => a.name.localeCompare(b.name, 'ja')).map((t, index) => [t.id, index]),
  )
  const orderOf = (s: StaffRecord) => teamOrder.get(s.team.id) ?? teamOrder.size
  return staffList
    .filter(
      (s) =>
        withoutSpaces(s.username).includes(name) &&
        (filter.teamId === '' || s.team.id === filter.teamId) &&
        (filter.positionId === '' || s.position.id === filter.positionId) &&
        (filter.departmentId === '' || s.department.id === filter.departmentId) &&
        (filter.status === 'all' || s.status === filter.status),
    )
    .sort((a, b) => orderOf(a) - orderOf(b) || a.username.localeCompare(b.username, 'ja'))
}
