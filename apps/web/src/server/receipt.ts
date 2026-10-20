import { ApiError, type ReceiptCheckInput } from '#/api/client'
import type { ReceiptCheckResult } from '#/api/bff/receiptCall'
import { createReceiptApi } from '#/api/http/receiptApi'

import { readSession, type AuthDeps } from './auth'

/**
 * 画面から受けた照合の入力を、照合の API に送る。form は parseReceiptForm で確かめた値である。
 *
 * セッションが無ければ status が 401 の失敗を、照合の API が失敗の状態を返せばその status と行の誤りを返す。
 * それ以外の失敗は投げる。
 */
export const checkReceipt = async (
  request: Request,
  form: FormData,
  deps: { auth: AuthDeps; receiptApiUrl: string; fetch?: typeof globalThis.fetch },
): Promise<ReceiptCheckResult> => {
  const session = await readSession(request, deps.auth)
  if (session === undefined) {
    return { ok: false, status: 401, message: 'ログインが必要です', rowErrors: [] }
  }
  const send = deps.fetch ?? globalThis.fetch
  const api = createReceiptApi({
    baseUrl: deps.receiptApiUrl,
    fetch: (input, init) => {
      const authorized = new Request(input, init)
      authorized.headers.set('Authorization', `Bearer ${session.accessToken}`)
      return send(authorized)
    },
  })
  const visits = form.get('visits') as Blob
  const schedules = form.get('schedules')
  const input: ReceiptCheckInput =
    schedules instanceof Blob
      ? { visits, schedules }
      : { visits, month: form.get('month') as string }
  try {
    return { ok: true, report: await api.check(input) }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, status: error.status, message: error.message, rowErrors: error.rowErrors }
    }
    throw error
  }
}
