import { ApiError, type BuddyApi } from '#/api/BuddyApi'
import { parseBffArgs, type BffCall, type BffData, type BffResult } from '#/api/bff/bffCall'
import { createHttpBuddyApi } from '#/api/http/httpBuddyApi'

import { fetchWithAccessToken, type AuthDeps } from './auth'
import { readSession } from './session'

/**
 * 画面からの BuddyApi の呼び出しを、セッションの access token を付けて予定の API に送る。
 *
 * 引数の先頭の事業所は、画面の値ではなくセッションの事業所に替える。引数の形が操作に合わなければ status が 400 の失敗を、
 * セッションが無ければ status が 401 の失敗を、
 * 予定の API が失敗の状態を返せばその status の失敗を返す。それ以外の失敗は投げる。
 */
export const callBff = async (
  request: Request,
  call: BffCall,
  deps: { auth: AuthDeps; scheduleApiUrl: string },
): Promise<BffResult> => {
  const parsed = parseBffArgs(call)
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }
  const session = await readSession(request, deps.auth)
  if (session === undefined) return { ok: false, status: 401, message: 'ログインが必要です' }
  const api = createHttpBuddyApi({
    baseUrl: deps.scheduleApiUrl,
    fetch: fetchWithAccessToken(session.accessToken),
  })
  const [group, name] = call.op.split('.') as [keyof BuddyApi, string]
  const operation = (api[group] as Record<string, (...args: unknown[]) => Promise<unknown>>)[name]
  try {
    return {
      ok: true,
      // 本文の無い操作（calendars.check、calendars.unlink）は undefined を返すので、JSON にできる null にする
      data: ((await operation(session.facilityId, ...parsed.args.slice(1))) ?? null) as BffData,
    }
  } catch (error) {
    if (error instanceof ApiError)
      return { ok: false, status: error.status, message: error.message, code: error.code }
    throw error
  }
}
