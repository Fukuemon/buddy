// @vitest-environment node
import * as client from 'openid-client'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vite-plus/test'

import { server } from '#/test/server'

import {
  createOidcClient,
  GrantRejectedError,
  HydraRefreshError,
  isGrantRejected,
  refreshFailureOf,
} from './oidc'

const bodyError = (error: string) =>
  new client.ResponseBodyError('token endpoint', {
    cause: { error },
    response: new Response(null, { status: error === 'access_denied' ? 403 : 400 }),
  })

describe('refreshFailureOf', () => {
  it('拒まれた refresh を rejected とし、OAuth のエラーの値を添える', () => {
    expect(refreshFailureOf(new GrantRejectedError('access_denied'))).toEqual({
      reason: 'rejected',
      error: 'access_denied',
    })
  })

  it('Hydra がそのほかのエラーを返したら hydra_error とし、OAuth のエラーの値を添える', () => {
    expect(refreshFailureOf(bodyError('server_error'))).toEqual({
      reason: 'hydra_error',
      error: 'server_error',
      status: 400,
    })
    expect(refreshFailureOf(new HydraRefreshError(500, 'server_error'))).toEqual({
      reason: 'hydra_error',
      error: 'server_error',
      status: 500,
    })
  })

  it('待ちの上限を過ぎたら timeout、Hydra に届かなければ unreachable、それ以外は other にする', () => {
    const timeout = Object.assign(new client.ClientError('operation timed out'), {
      code: 'OAUTH_TIMEOUT',
    })
    expect(refreshFailureOf(timeout)).toEqual({ reason: 'timeout' })
    expect(refreshFailureOf(new TypeError('fetch failed'))).toEqual({ reason: 'unreachable' })
    expect(refreshFailureOf(new Error('?'))).toEqual({ reason: 'other' })
  })
})

describe('isGrantRejected', () => {
  it('取り消した refresh token の invalid_grant を、拒まれた refresh とみなす', () => {
    expect(isGrantRejected(bodyError('invalid_grant'))).toBe(true)
  })

  it('ブローカーが token_hook で拒ませた access_denied を、拒まれた refresh とみなす', () => {
    expect(isGrantRejected(bodyError('access_denied'))).toBe(true)
  })

  it('ほかのエラーと通信の失敗は、拒まれた refresh とみなさない', () => {
    expect(isGrantRejected(bodyError('server_error'))).toBe(false)
    expect(isGrantRejected(new Error('ECONNRESET'))).toBe(false)
  })
})

const ISSUER = 'http://hydra.test'

/** トークンのエンドポイントが status と body を返す Hydra に向けた OidcClient の refresh が投げたエラーを返す。 */
const refreshError = async (status: number, body: string, contentType = 'application/json') => {
  server.use(
    http.get(`${ISSUER}/.well-known/openid-configuration`, () =>
      HttpResponse.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/oauth2/auth`,
        token_endpoint: `${ISSUER}/oauth2/token`,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      }),
    ),
    http.post(
      `${ISSUER}/oauth2/token`,
      () => new HttpResponse(body, { status, headers: { 'Content-Type': contentType } }),
    ),
  )
  const oidc = await createOidcClient({ issuer: ISSUER, clientId: 'web', clientSecret: 'secret' })
  return oidc.refresh('refresh-1').then(
    () => undefined,
    (error: unknown) => error,
  )
}

describe('createOidcClient の refresh', () => {
  it('Hydra の 5xx の本文の OAuth のエラーの値と状態コードを、ログの値にする', async () => {
    const error = await refreshError(500, JSON.stringify({ error: 'server_error' }))
    expect(error).toBeInstanceOf(HydraRefreshError)
    expect(refreshFailureOf(error)).toEqual({
      reason: 'hydra_error',
      error: 'server_error',
      status: 500,
    })
  })

  it('Hydra の 5xx の本文が JSON でなければ、状態コードだけをログの値にする', async () => {
    const error = await refreshError(502, 'Bad Gateway', 'text/plain')
    expect(refreshFailureOf(error)).toEqual({ reason: 'hydra_error', status: 502 })
  })

  it('invalid_grant は、拒まれた refresh にする', async () => {
    const error = await refreshError(400, JSON.stringify({ error: 'invalid_grant' }))
    expect(error).toBeInstanceOf(GrantRejectedError)
    expect(refreshFailureOf(error)).toEqual({ reason: 'rejected', error: 'invalid_grant' })
  })
})
