import { RECEIPT_CHECK, STAFF_MANAGE } from '#/api/permissions'
import { SCHEDULE_POLICY_CODES, type StaffPolicy } from '#/api/types'

const ORDER: readonly string[] = [...SCHEDULE_POLICY_CODES, STAFF_MANAGE, RECEIPT_CHECK]

/** 持っている権限を、予定の 7 つの権限、職員の管理、照合の順に並べる。どれでもない権限は最後に、渡した順で置く。 */
export const orderOwnPolicies = (policies: readonly StaffPolicy[]) => {
  const rank = (code: string) => {
    const i = ORDER.indexOf(code)
    return i === -1 ? ORDER.length : i
  }
  return [...policies].sort((a, b) => rank(a.code) - rank(b.code))
}
