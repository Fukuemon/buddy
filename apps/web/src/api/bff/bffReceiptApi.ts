import { ApiError, type ReceiptApi } from '../client'
import { loginHref } from '../viewer'
import type { ReceiptCheckResult } from './receiptCall'
import { checkReceiptFn } from './serverFns'

type CheckReceipt = (form: FormData) => Promise<ReceiptCheckResult>

/**
 * BFF の server function で照合する ReceiptApi を作る。
 *
 * 失敗は status と行のエラーつきの ApiError で投げる。ブラウザで 401 を受けたら、今の画面に戻るログインへ移る。
 */
export const createBffReceiptApi = (
  checkReceipt: CheckReceipt = (data) => checkReceiptFn({ data }),
): ReceiptApi => ({
  check: async (input) => {
    const form = new FormData()
    form.append('visits', input.visits, 'visits.csv')
    if (input.schedules !== undefined) form.append('schedules', input.schedules, 'schedules.csv')
    if (input.month !== undefined) form.append('month', input.month)
    const result = await checkReceipt(form)
    if (result.ok) return result.report
    if (result.status === 401 && typeof window !== 'undefined') {
      window.location.assign(loginHref(window.location.pathname + window.location.search))
      // 画面が移るまでの間に、呼び出し元がエラーの表示を出さないよう、終わらない Promise を返す
      return new Promise<never>(() => {})
    }
    throw new ApiError(result.status, result.message, result.rowErrors)
  },
})
