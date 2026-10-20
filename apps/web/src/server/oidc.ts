import * as client from 'openid-client'

import type { ServerConfig } from './config'

/** トークンのエンドポイントの応答のうち、BFF が使う値。 */
export type Tokens = {
  accessToken: string
  refreshToken?: string
  /** access token の残りの秒数。ブローカーが返さなければ undefined。 */
  expiresIn?: number
}

/** BFF がブローカーと交わす操作。テストでは偽物に替える。 */
export interface OidcClient {
  authorizationUrl(params: {
    redirectUri: string
    state: string
    nonce: string
    codeChallenge: string
  }): URL
  /** currentUrl はコールバックの要求の URL で、code と state を持つ。検証に失敗すると Error を投げる。 */
  exchangeCode(
    currentUrl: URL,
    checks: { codeVerifier: string; state: string; nonce: string },
  ): Promise<Tokens>
  /** refresh token で access token を取り直す。失敗すると Error を投げる。 */
  refresh(refreshToken: string): Promise<Tokens>
}

const toTokens = (res: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers) => ({
  accessToken: res.access_token,
  refreshToken: res.refresh_token,
  expiresIn: res.expiresIn(),
})

/**
 * openid-client で OidcClient を作る。発行者の discovery の文書を読めなければ Error を投げる。
 *
 * 発行者の URL が http のときは、手元の IdP とみなして http の要求を許す。
 */
export const createOidcClient = async (cfg: ServerConfig['oidc']): Promise<OidcClient> => {
  const issuer = new URL(cfg.issuer)
  const insecure = issuer.protocol === 'http:'
  const config = await client.discovery(
    issuer,
    cfg.clientId,
    undefined,
    client.ClientSecretBasic(cfg.clientSecret),
    insecure ? { execute: [client.allowInsecureRequests] } : undefined,
  )
  return {
    authorizationUrl: ({ redirectUri, state, nonce, codeChallenge }) => {
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid email offline_access',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
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
    refresh: async (refreshToken) => toTokens(await client.refreshTokenGrant(config, refreshToken)),
  }
}

export const randomState = client.randomState
export const randomNonce = client.randomNonce
export const randomCodeVerifier = client.randomPKCECodeVerifier
export const codeChallengeOf = client.calculatePKCECodeChallenge
