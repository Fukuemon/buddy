// @vitest-environment node
import * as client from 'openid-client'
import { describe, expect, it } from 'vite-plus/test'

import { isGrantRejected } from './oidc'

const bodyError = (error: string) =>
  new client.ResponseBodyError('token endpoint', {
    cause: { error },
    response: new Response(null, { status: error === 'access_denied' ? 403 : 400 }),
  })

describe('isGrantRejected', () => {
  it('取り消した refresh token の invalid_grant を、拒まれた refresh とみなす', () => {
    expect(isGrantRejected(bodyError('invalid_grant'))).toBe(true)
  })

  it('ブローカーの token_hook が拒んだ access_denied を、拒まれた refresh とみなす', () => {
    expect(isGrantRejected(bodyError('access_denied'))).toBe(true)
  })

  it('ほかのエラーと通信の失敗は、拒まれた refresh とみなさない', () => {
    expect(isGrantRejected(bodyError('server_error'))).toBe(false)
    expect(isGrantRejected(new Error('ECONNRESET'))).toBe(false)
  })
})
