import * as client from 'openid-client'

import type { ServerConfig } from './config'

/**
 * Hydra が refresh token を拒んだときに投げる。セッションを捨ててよい。
 * 取り消した refresh token は invalid_grant に、ブローカーが token_hook で拒ませた refresh（止めた職員、上流でのログインから
 * 12 時間を過ぎたログイン）は access_denied になる。
 */
export class GrantRejectedError extends Error {
  /** Hydra が返した OAuth のエラーの値。ログに出す。 */
  readonly code: string

  constructor(code = 'invalid_grant') {
    super('Hydra が refresh token を拒んだ')
    this.name = 'GrantRejectedError'
    this.code = code
  }
}

/**
 * Hydra が refresh に 5xx を返したときに投げる。openid-client は 5xx の本文を読まないので、OAuth のエラーの値をここで読む。
 * 障害の間は、ブローカーの token_hook が失敗した server_error が返る。
 */
export class HydraRefreshError extends Error {
  /** Hydra が返した HTTP の状態コード。 */
  readonly status: number
  /** 本文の OAuth のエラーの値。本文が JSON でなければ undefined。 */
  readonly code?: string

  constructor(status: number, code?: string) {
    super(`Hydra が refresh に ${status} を返した`)
    this.name = 'HydraRefreshError'
    this.status = status
    this.code = code
  }
}

/** openid-client が、Hydra の 5xx を形の合わないレスポンスとして投げたものなら、HydraRefreshError にする。ほかは undefined を返す。 */
const hydraRefreshErrorOf = async (error: unknown) => {
  if (!(error instanceof client.ClientError) || error.code !== 'OAUTH_RESPONSE_IS_NOT_CONFORM')
    return undefined
  const response = error.cause
  if (!(response instanceof Response)) return undefined
  const body = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined
  return new HydraRefreshError(
    response.status,
    typeof body?.error === 'string' ? body.error : undefined,
  )
}

/**
 * refresh の失敗の種類。ログの reason に出す（context/operations.md の監視の項目とアラートの条件）。
 * rejected は Hydra が refresh token を拒んだ、hydra_error は Hydra がそのほかのエラーを返した、timeout は待ちの上限を過ぎた、
 * unreachable は Hydra に届かなかった、other はそれ以外である。
 */
export type RefreshFailureReason = 'rejected' | 'hydra_error' | 'timeout' | 'unreachable' | 'other'

/**
 * refresh が投げた error から、失敗の種類と、Hydra が返した OAuth のエラーの値と HTTP の状態コードを取り出す。トークンは含めない。
 */
export const refreshFailureOf = (
  error: unknown,
): { reason: RefreshFailureReason; error?: string; status?: number } => {
  if (error instanceof GrantRejectedError) return { reason: 'rejected', error: error.code }
  if (error instanceof HydraRefreshError)
    return { reason: 'hydra_error', error: error.code, status: error.status }
  if (error instanceof client.ResponseBodyError)
    return { reason: 'hydra_error', error: error.error, status: error.status }
  // openid-client は、待ちの上限を過ぎると code が OAUTH_TIMEOUT の ClientError を、つながらないと fetch の TypeError を投げる
  if (error instanceof client.ClientError && error.code === 'OAUTH_TIMEOUT')
    return { reason: 'timeout' }
  if (error instanceof TypeError) return { reason: 'unreachable' }
  return { reason: 'other' }
}

/** トークンのエンドポイントのレスポンスのうち、BFF が使う値。 */
export type Tokens = {
  accessToken: string
  refreshToken?: string
  /** access token の残りの秒数。Hydra が返さなければ undefined。 */
  expiresIn?: number
  /** ログアウトで Hydra に添える ID token。refresh で Hydra が返さなければ undefined。 */
  idToken?: string
}

/** BFF が Hydra と交わす操作。テストではフェイクに替える。 */
export interface OidcClient {
  authorizationUrl(params: {
    redirectUri: string
    state: string
    nonce: string
    codeChallenge: string
    /** login なら、Hydra が保ったログインのセッションを使わず、ブローカーのメールの入力の画面を出させる。 */
    prompt?: 'login'
  }): URL
  /** currentUrl はコールバックのリクエストの URL で、code と state を持つ。検証に失敗すると Error を投げる。 */
  exchangeCode(
    currentUrl: URL,
    checks: { codeVerifier: string; state: string; nonce: string },
  ): Promise<Tokens>
  /** refresh token で access token を更新する。拒まれたら GrantRejectedError を、通信の失敗などはそのほかの Error を投げる。 */
  refresh(refreshToken: string): Promise<Tokens>
  /** ブラウザをリダイレクトする、Hydra の RP-Initiated Logout の URL。 */
  endSessionUrl(params: { idTokenHint: string; postLogoutRedirectUri: string }): URL
}

/** refresh のエラーのうち、更新しても通らないので、セッションを捨ててよいものの OAuth のエラーの値。 */
const REJECTED_GRANT_ERRORS = new Set(['invalid_grant', 'access_denied'])

/** error が、Hydra が refresh token を拒んだことを示すかを返す。 */
export const isGrantRejected = (error: unknown): error is client.ResponseBodyError =>
  error instanceof client.ResponseBodyError && REJECTED_GRANT_ERRORS.has(error.error)

/** Hydra へのリクエストを待つ上限。auth.ts の更新の鍵の期限より短くする。 */
export const OIDC_TIMEOUT_SECONDS = 5

const toTokens = (
  response: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
) => ({
  accessToken: response.access_token,
  refreshToken: response.refresh_token,
  expiresIn: response.expiresIn(),
  idToken: response.id_token,
})

/**
 * openid-client で OidcClient を作る。Issuer の discovery の文書を読めなければ Error を投げる。
 *
 * Issuer の URL が http のときは、ローカル環境の IdP とみなして http のリクエストを許す。
 */
export const createOidcClient = async (cfg: ServerConfig['oidc']): Promise<OidcClient> => {
  const issuer = new URL(cfg.issuer)
  const insecure = issuer.protocol === 'http:'
  const config = await client.discovery(
    issuer,
    cfg.clientId,
    undefined,
    client.ClientSecretBasic(cfg.clientSecret),
    { timeout: OIDC_TIMEOUT_SECONDS, execute: insecure ? [client.allowInsecureRequests] : [] },
  )
  return {
    authorizationUrl: ({ redirectUri, state, nonce, codeChallenge, prompt }) => {
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid email offline_access',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(prompt === undefined ? {} : { prompt }),
      })
      if (cfg.authorizationEndpoint === undefined) return url
      const browserUrl = new URL(cfg.authorizationEndpoint)
      browserUrl.search = url.search
      return browserUrl
    },
    exchangeCode: async (currentUrl, { codeVerifier, state, nonce }) =>
      toTokens(
        await client.authorizationCodeGrant(config, currentUrl, {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
          expectedNonce: nonce,
          idTokenExpected: true,
        }),
      ),
    endSessionUrl: ({ idTokenHint, postLogoutRedirectUri }) => {
      const url = client.buildEndSessionUrl(config, {
        id_token_hint: idTokenHint,
        post_logout_redirect_uri: postLogoutRedirectUri,
      })
      if (cfg.endSessionEndpoint === undefined) return url
      const browserUrl = new URL(cfg.endSessionEndpoint)
      browserUrl.search = url.search
      return browserUrl
    },
    refresh: async (refreshToken) => {
      try {
        return toTokens(await client.refreshTokenGrant(config, refreshToken))
      } catch (error) {
        if (isGrantRejected(error)) {
          throw new GrantRejectedError(error.error)
        }
        throw (await hydraRefreshErrorOf(error)) ?? error
      }
    },
  }
}

export const randomState = client.randomState
export const randomNonce = client.randomNonce
export const randomCodeVerifier = client.randomPKCECodeVerifier
export const codeChallengeOf = client.calculatePKCECodeChallenge
