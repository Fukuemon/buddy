/** BFF がサーバーで読む設定。全ての値は環境変数から読む。 */
export type ServerConfig = {
  oidc: {
    /** Hydra の Issuer の URL。discovery の文書をここから読む。 */
    issuer: string
    clientId: string
    clientSecret: string
    /**
     * ブラウザをリダイレクトする認可の URL。discovery の authorization_endpoint の代わりに使う。
     * ローカル環境の compose のように、web とブラウザから届く IdP の URL が違うときだけ渡す。
     */
    authorizationEndpoint?: string
    /**
     * ブラウザをリダイレクトする RP-Initiated Logout の URL。discovery の end_session_endpoint の代わりに使う。
     * Hydra は end_session_endpoint を Issuer の URL から作るので、web とブラウザから届く IdP の URL が違うときに渡す。
     */
    endSessionEndpoint?: string
  }
  /** セッションの保存先。`redis://` なら Valkey、`postgres://` か `postgresql://` なら PostgreSQL に置く（ADR-0047）。 */
  sessionStoreUrl: string
  /** 保存先が PostgreSQL のときの、接続のプールの接続の数の上限。 */
  sessionStoreMaxConnections: number
  sessionSecret: string
  /** セッションの cookie に Secure を付けるか。https でないローカル環境だけ false にする。 */
  usesSecureCookie: boolean
  /**
   * ブラウザが開く web のオリジン（例: https://web.example.com）。ログインとログアウトの戻り先の URL を作るのに使う。
   * TLS を終端するプロキシの後ろでは、リクエストの URL が http になり、IdP に登録した戻り先と合わないので渡す。
   * 渡さなければ、リクエストの URL を使う。
   */
  publicUrl?: string
  scheduleApiUrl: string
  receiptApiUrl: string
}

const REQUIRED = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'SESSION_STORE_URL',
  'SESSION_SECRET',
  'SCHEDULE_URL',
  'RECEIPT_URL',
] as const

/** SESSION_STORE_MAX_CONNS が無いときの、PostgreSQL の接続の数の上限。 */
const DEFAULT_SESSION_STORE_MAX_CONNS = 5

/** cookie の署名の鍵の最小のバイト数。HMAC-SHA256 の出力と同じ長さにする。 */
const MIN_SECRET_BYTES = 32

/**
 * env（本番では process.env）から BFF の設定を読む。
 *
 * 必須の値が欠けているときは欠けた名前を並べた Error を、SESSION_SECRET が 32 バイトより短いときと、
 * SESSION_STORE_URL のスキームが redis、postgres、postgresql のどれでもないときと、
 * SESSION_STORE_MAX_CONNS が正の整数でないときは Error を投げる。
 */
export const loadServerConfig = (env: Record<string, string | undefined>): ServerConfig => {
  const missing = REQUIRED.filter((key) => !env[key])
  if (missing.length > 0) throw new Error(`環境変数 ${missing.join(', ')} が必要です`)
  const get = (key: (typeof REQUIRED)[number]) => env[key] as string
  if (Buffer.byteLength(get('SESSION_SECRET')) < MIN_SECRET_BYTES) {
    throw new Error(`SESSION_SECRET は ${MIN_SECRET_BYTES} バイト以上にする`)
  }
  if (!/^(redis|postgres|postgresql):\/\//.test(get('SESSION_STORE_URL'))) {
    throw new Error('SESSION_STORE_URL は redis://、postgres://、postgresql:// のどれかで始める')
  }
  const maxConns = Number(env.SESSION_STORE_MAX_CONNS || DEFAULT_SESSION_STORE_MAX_CONNS)
  if (!Number.isInteger(maxConns) || maxConns < 1) {
    throw new Error('SESSION_STORE_MAX_CONNS は 1 以上の整数にする')
  }
  return {
    oidc: {
      issuer: get('OIDC_ISSUER'),
      clientId: get('OIDC_CLIENT_ID'),
      clientSecret: get('OIDC_CLIENT_SECRET'),
      authorizationEndpoint: env.OIDC_AUTHORIZATION_ENDPOINT || undefined,
      endSessionEndpoint: env.OIDC_END_SESSION_ENDPOINT || undefined,
    },
    sessionStoreUrl: get('SESSION_STORE_URL'),
    sessionStoreMaxConnections: maxConns,
    sessionSecret: get('SESSION_SECRET'),
    usesSecureCookie: env.SESSION_COOKIE_SECURE !== 'false',
    publicUrl: env.PUBLIC_URL || undefined,
    scheduleApiUrl: get('SCHEDULE_URL'),
    receiptApiUrl: get('RECEIPT_URL'),
  }
}
