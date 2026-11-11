import { ApiError, type ReceiptCheckInput } from '#/api/BuddyApi'
import type { ReceiptCheckResult } from '#/api/bff/receiptCall'
import { createReceiptApi } from '#/api/http/receiptApi'
import {
  SESSION_UNAVAILABLE_CODE,
  SESSION_UNAVAILABLE_MESSAGE,
  SessionUnavailableError,
} from '#/api/sessionUnavailable'

import { fetchWithAccessToken, type AuthDeps } from './auth'
import { readSession } from './session'

/**
 * 画面から受けた照合の入力を、照合の API に送る。form は parseReceiptForm で確認した値である。
 *
 * セッションが無ければ status が 401 の失敗を、ログインの期限を延ばせなければ status が 503 でコードが session_unavailable の失敗を、
 * 照合の API が失敗の状態を返せばその status とコードと行のエラーを返す。
 * それ以外の失敗は投げる。
 */
export const checkReceipt = async (
  request: Request,
  form: FormData,
  deps: { auth: AuthDeps; receiptApiUrl: string },
): Promise<ReceiptCheckResult> => {
  let session
  try {
    session = await readSession(request, deps.auth)
  } catch (error) {
    if (!(error instanceof SessionUnavailableError)) throw error
    return {
      ok: false,
      status: 503,
      message: SESSION_UNAVAILABLE_MESSAGE,
      csvErrors: [],
      code: SESSION_UNAVAILABLE_CODE,
    }
  }
  if (session === undefined) {
    return { ok: false, status: 401, message: 'ログインが必要です', csvErrors: [] }
  }
  const api = createReceiptApi({
    baseUrl: deps.receiptApiUrl,
    fetch: fetchWithAccessToken(session.accessToken),
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
      return {
        ok: false,
        status: error.status,
        message: error.message,
        csvErrors: error.csvErrors,
        code: error.code,
      }
    }
    throw error
  }
}
