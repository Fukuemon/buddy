// @vitest-environment node
import * as client from 'openid-client'
import { describe, expect, it } from 'vite-plus/test'

import { GrantRejectedError, isGrantRejected, refreshFailureOf } from './oidc'

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
