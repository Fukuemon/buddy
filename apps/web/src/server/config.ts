/** BFF がサーバーで読む設定。全ての値は環境変数から読む。 */
export type ServerConfig = {
  oidc: {
    /** ブローカーの Issuer の URL。discovery の文書をここから読む。 */
    issuer: string
    clientId: string
    clientSecret: string
    /**
     * ブラウザを転送する認可の URL。discovery の authorization_endpoint の代わりに使う。
     * ローカル環境の compose のように、web とブラウザから届く IdP の URL が違うときだけ渡す。
     */
    authorizationEndpoint?: string
  }
  sessionStoreUrl: string
  sessionSecret: string
  /** セッションの cookie に Secure を付けるか。https でないローカル環境だけ false にする。 */
  secureCookie: boolean
  scheduleApiUrl: string
  receiptApiUrl: string
}

const REQUIRED = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'SESSION_STORE_URL',
  'SESSION_SECRET',
  'SCHEDULE_API_URL',
  'RECEIPT_API_URL',
] as const

/** cookie の署名の鍵の最小のバイト数。HMAC-SHA256 の出力と同じ長さにする。 */
const MIN_SECRET_BYTES = 32

/**
 * env（本番では process.env）から BFF の設定を読む。
 *
 * 必須の値が欠けているときは欠けた名前を並べた Error を、SESSION_SECRET が 32 バイトより短いときは Error を投げる。
 */
export const loadServerConfig = (env: Record<string, string | undefined>): ServerConfig => {
  const missing = REQUIRED.filter((key) => !env[key])
  if (missing.length > 0) throw new Error(`環境変数 ${missing.join(', ')} が必要です`)
  const get = (key: (typeof REQUIRED)[number]) => env[key] as string
  if (Buffer.byteLength(get('SESSION_SECRET')) < MIN_SECRET_BYTES) {
    throw new Error(`SESSION_SECRET は ${MIN_SECRET_BYTES} バイト以上にする`)
  }
  return {
    oidc: {
      issuer: get('OIDC_ISSUER'),
      clientId: get('OIDC_CLIENT_ID'),
      clientSecret: get('OIDC_CLIENT_SECRET'),
      authorizationEndpoint: env.OIDC_AUTHORIZATION_ENDPOINT || undefined,
    },
    sessionStoreUrl: get('SESSION_STORE_URL'),
    sessionSecret: get('SESSION_SECRET'),
    secureCookie: env.SESSION_COOKIE_SECURE !== 'false',
    scheduleApiUrl: get('SCHEDULE_API_URL'),
    receiptApiUrl: get('RECEIPT_API_URL'),
  }
}
