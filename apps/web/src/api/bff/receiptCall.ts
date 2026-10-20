import type { ReceiptReport, ReceiptRowError } from '../types'

/**
 * 照合の入力のファイルの合計の上限のバイト数。照合の API の MAX_UPLOAD_BYTES の既定（10 MiB）は multipart の本文の全体に
 * 掛かるので、境界と見出しの分の 64 KiB を引く。
 */
export const MAX_RECEIPT_UPLOAD_BYTES = 10 * 1024 * 1024 - 64 * 1024

/** server function の本文の上限のバイト数。本文を読む前に、src/start.ts がこれより大きい要求を拒む。 */
export const MAX_SERVER_FN_BODY_BYTES = 10 * 1024 * 1024

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** BFF の照合の応答。ApiError は class のままでは server function を越えられないので、値にして返す。 */
export type ReceiptCheckResult =
  | { ok: true; report: ReceiptReport }
  | { ok: false; status: number; message: string; rowErrors: ReceiptRowError[] }

/**
 * server function の入力の FormData を、照合の入力として確かめる。
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
