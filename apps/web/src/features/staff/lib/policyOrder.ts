import { RECEIPT_CHECK, STAFF_MANAGE } from '#/api/permissions'
import { SCHEDULE_POLICY_CODES } from '#/api/types'

const ORDER: readonly string[] = [...SCHEDULE_POLICY_CODES, STAFF_MANAGE, RECEIPT_CHECK]

/**
 * 権限を、予定の 7 つの権限、職員の管理、照合の順に並べる。どれでもない権限は最後に、渡した順で置く。
 * 職員の詳細の権限の一覧と権限を変えるダイアログ、自分の情報の権限を、同じ並びにする。
 */
export const orderPolicies = <T extends { code: string }>(policies: readonly T[]) => {
  const rank = (code: string) => {
    const i = ORDER.indexOf(code)
    return i === -1 ? ORDER.length : i
  }
  return [...policies].sort((a, b) => rank(a.code) - rank(b.code))
}
