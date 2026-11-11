import { getMe } from '#/api/http/meApi'

import type { AuthDeps } from './auth'
import { loadServerConfig, type ServerConfig } from './config'
import { createOidcClient, type OidcClient } from './oidc'
import { createPostgresSessionStore } from './postgresSessionStore'
import { createValkeySessionStore, type SessionStore } from './sessionStore'

// 開発サーバーを msw の mode で起動したときだけ、.env.msw を読み、2 つの API をフェイクに替える。
// vp build は NODE_ENV を production にするので import.meta.env.DEV が false になり、この分岐は msw ごとビルドから消える。
// 開発サーバーはこのファイルを編集のたびに評価し直すので、横取りを重ねないよう、プロセスで 1 度だけ始める
const mockStarted = Symbol.for('buddy.apiMocksStarted')
if (import.meta.env.DEV && import.meta.env.MODE === 'msw' && !(mockStarted in globalThis)) {
  Object.assign(globalThis, { [mockStarted]: true })
  // シェルで渡した値は .env.msw の値より勝つ
  process.loadEnvFile(new URL('../../.env.msw', import.meta.url))
  const { startApiMocks } = await import('#/mocks/node')
  startApiMocks(process.env)
}

type Runtime = { config: ServerConfig; store: SessionStore }

let runtime: Runtime | undefined
let oidc: Promise<OidcClient> | undefined

/** PostgreSQL のセッションの、期限の切れた行を消す間隔（ADR-0047）。 */
const PURGE_INTERVAL_MS = 10 * 60 * 1000

/** SESSION_STORE_URL のスキームで保存先を選ぶ。PostgreSQL なら、期限の切れた行を定期に消す。 */
const createSessionStore = (config: ServerConfig): SessionStore => {
  if (config.sessionStoreUrl.startsWith('redis://')) {
    return createValkeySessionStore(config.sessionStoreUrl)
  }
  const store = createPostgresSessionStore(
    config.sessionStoreUrl,
    config.sessionSecret,
    config.sessionStoreMaxConnections,
  )
  // 掃除が残っていても、プロセスの終了を止めない
  setInterval(() => {
    store.purgeExpired().catch((error: unknown) => {
      // 消せなくても読み取りは期限で絞るので、次の回に試し直す
      console.warn(JSON.stringify({ msg: 'session purge failed', cause: String(error) }))
    })
  }, PURGE_INTERVAL_MS).unref()
  return store
}

/** プロセスで 1 つの設定とセッションの保存先を返す。設定が欠けていれば Error を投げる。 */
export const getRuntime = (): Runtime => {
  if (runtime === undefined) {
    const config = loadServerConfig(process.env)
    runtime = { config, store: createSessionStore(config) }
  }
  return runtime
}

const getOidc = (config: ServerConfig) => {
  if (oidc === undefined) {
    oidc = createOidcClient(config.oidc).catch((error: unknown) => {
      // 起動の直後に Hydra へ届かなくても、次のリクエストで discovery を試し直す
      oidc = undefined
      throw error
    })
  }
  return oidc
}

/** 認証の処理に渡す依存を返す。 */
export const getAuthDeps = async (): Promise<AuthDeps> => {
  const { config, store } = getRuntime()
  return {
    store,
    oidc: await getOidc(config),
    secret: config.sessionSecret,
    usesSecureCookie: config.usesSecureCookie,
    publicUrl: config.publicUrl,
    getMe: (accessToken) => getMe(config.scheduleApiUrl, accessToken),
  }
}
