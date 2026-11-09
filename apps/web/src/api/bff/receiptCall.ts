import { MAX_RECEIPT_UPLOAD_BYTES } from '../BuddyApi'
import type { ReceiptReport, ReceiptCsvError } from '../types'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** BFF の照合のレスポンス。ApiError は class のままでは server function を越えられないので、値にして返す。 */
export type ReceiptCheckResult =
  | { ok: true; report: ReceiptReport }
  | { ok: false; status: number; message: string; csvErrors: ReceiptCsvError[]; code?: string }

/**
 * server function の入力の FormData を、照合の入力として確認する。
 *
 * visits のファイルが無い、予定の CSV（schedules）と対象の月（month）の両方か一方も無い、month の形が違う、
 * ファイルの合計が上限を超える、のいずれかで Error を投げる。
 */
export const parseReceiptForm = (input: unknown): FormData => {
  if (!(input instanceof FormData)) throw new Error('照合の入力は FormData にする')
  const visits = input.get('visits')
  const schedules = input.get('schedules')
  const month = input.get('month')
  if (!(visits instanceof Blob)) throw new Error('実訪問の CSV（visits）が必要です')
  if ((schedules === null) === (month === null)) {
    throw new Error('予定の CSV（schedules）か対象の月（month）の一方を渡す')
  }
  if (schedules !== null && !(schedules instanceof Blob))
    throw new Error('schedules はファイルにする')
  if (month !== null && (typeof month !== 'string' || !MONTH.test(month))) {
    throw new Error('month は YYYY-MM にする')
  }
  const size = visits.size + (schedules instanceof Blob ? schedules.size : 0)
  if (size > MAX_RECEIPT_UPLOAD_BYTES) throw new Error('ファイルが大きすぎます')
  return input
}
