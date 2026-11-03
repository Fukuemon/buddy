import type { Staff, StaffRecord } from './types'

/** 予定の担当の候補にする職員の規則。有効（休職でも退職でもない）で、訪問する職員だけを候補にする（ADR-0022）。 */
const isAssignable = (status: StaffRecord['status'], visits: boolean) =>
  status === 'active' && visits

/** 画面の型の職員（Staff）が、予定の担当の候補になるかを返す。 */
export const isActiveStaff = (staff: Staff): boolean =>
  isAssignable(staff.status ?? 'active', staff.nonVisiting !== true)

/** API の型の職員（StaffRecord）が、予定の担当の候補になるかを返す。 */
export const isActiveStaffRecord = (staff: StaffRecord): boolean =>
  isAssignable(staff.status, staff.visits)
