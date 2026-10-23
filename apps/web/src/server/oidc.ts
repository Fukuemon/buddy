import * as client from 'openid-client'

import type { ServerConfig } from './config'

/**
 * Hydra が refresh token を拒んだときに投げる。セッションを捨ててよい。
 * 取り消した refresh token は invalid_grant に、ブローカーが token_hook で拒ませた refresh（止めた職員、上流でのログインから
 * 12 時間を過ぎたログイン）は access_denied になる。
 */
export class GrantRejectedError extends Error {
  constructor() {
    super('Hydra が refresh token を拒んだ')
    this.name = 'GrantRejectedError'
  }
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
  /** refresh token で access token を取り直す。拒まれたら GrantRejectedError を、通信の失敗などはそのほかの Error を投げる。 */
  refresh(refreshToken: string): Promise<Tokens>
  /** ブラウザをリダイレクトする、Hydra の RP-Initiated Logout の URL。 */
  endSessionUrl(params: { idTokenHint: string; postLogoutRedirectUri: string }): URL
}

/** refresh のエラーのうち、取り直しても通らないので、セッションを捨ててよいものの OAuth のエラーの値。 */
const REJECTED_GRANT_ERRORS = new Set(['invalid_grant', 'access_denied'])

/** error が、Hydra が refresh token を拒んだことを示すかを返す。 */
export const isGrantRejected = (error: unknown) =>
  error instanceof client.ResponseBodyError && REJECTED_GRANT_ERRORS.has(error.error)

/** Hydra へのリクエストを待つ上限。auth.ts の更新の鍵の期限より短くする。 */
export const OIDC_TIMEOUT_SECONDS = 5

const toTokens = (res: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers) => ({
  accessToken: res.access_token,
  refreshToken: res.refresh_token,
  expiresIn: res.expiresIn(),
  idToken: res.id_token,
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
          throw new GrantRejectedError()
        }
        throw error
      }
    },
  }
}

export const randomState = client.randomState
export const randomNonce = client.randomNonce
export const randomCodeVerifier = client.randomPKCECodeVerifier
export const codeChallengeOf = client.calculatePKCECodeChallenge
