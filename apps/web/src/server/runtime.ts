import createClient from 'openapi-fetch'

import type { paths } from '#/api/generated/schedule'

import type { AuthDeps, MeResult } from './auth'
import { loadServerConfig, type ServerConfig } from './config'
import { createOidcClient, type OidcClient } from './oidc'
import { createValkeySessionStore, type SessionStore } from './sessionStore'

type Runtime = { config: ServerConfig; store: SessionStore }

let runtime: Runtime | undefined
let oidc: Promise<OidcClient> | undefined

/** プロセスで 1 つの設定とセッションの置き場を返す。設定が欠けていれば Error を投げる。 */
export const getRuntime = (): Runtime => {
  if (runtime === undefined) {
    const config = loadServerConfig(process.env)
    runtime = { config, store: createValkeySessionStore(config.sessionStoreUrl) }
  }
  return runtime
}

const getOidc = (config: ServerConfig) => {
  if (oidc === undefined) {
    oidc = createOidcClient(config.oidc).catch((error: unknown) => {
      // 起動の直後にブローカーへ届かなくても、次の要求で discovery を試し直す
      oidc = undefined
      throw error
    })
  }
  return oidc
}

/** access token で予定の API の GET /v1/me を呼ぶ。 */
export const fetchMe = async (scheduleApiUrl: string, accessToken: string): Promise<MeResult> => {
  const api = createClient<paths>({ baseUrl: scheduleApiUrl })
  const { data, response } = await api.GET('/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (data !== undefined) {
    return {
      ok: true,
      viewer: { staffId: data.id, staffName: data.username, facilityId: data.facility_id },
    }
  }
  return { ok: false, reason: response.status === 403 ? 'forbidden' : 'failed' }
}

/** 認証の処理に渡す依存を返す。 */
export const getAuthDeps = async (): Promise<AuthDeps> => {
  const { config, store } = getRuntime()
  return {
    store,
    oidc: await getOidc(config),
    secret: config.sessionSecret,
    secureCookie: config.secureCookie,
    fetchMe: (accessToken) => fetchMe(config.scheduleApiUrl, accessToken),
  }
}
