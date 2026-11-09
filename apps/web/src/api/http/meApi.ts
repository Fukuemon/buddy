import createClient from 'openapi-fetch'

import type { paths } from '../generated/schedule'
import type { Viewer } from '../types'
import { fromApiMe } from './scheduleMapper'

/** GET /v1/me の結果。forbidden は、事業所に登録されていない職員である。 */
export type MeResult = { ok: true; viewer: Viewer } | { ok: false; reason: 'forbidden' | 'failed' }

/** access token で予定の API の GET /v1/me を呼び、ログインした職員を返す。通信の失敗では投げる。 */
export const getMe = async (scheduleApiUrl: string, accessToken: string): Promise<MeResult> => {
  const api = createClient<paths>({ baseUrl: scheduleApiUrl })
  const { data, response } = await api.GET('/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (data !== undefined) return { ok: true, viewer: fromApiMe(data) }
  return { ok: false, reason: response.status === 403 ? 'forbidden' : 'failed' }
}
