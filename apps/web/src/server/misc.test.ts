// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { parseBffArgs, parseBffCall } from '#/api/bff/bffCall'

import { loadServerConfig } from './config'
import { createMemorySessionStore } from './sessionStore'
import { exceedsBodyLimit } from './bodyLimit'
import { isSameHostOrigin } from './sameOrigin'
import { signValue, verifySignedValue } from './signedValue'

const env = {
  OIDC_ISSUER: 'http://idp.test/buddy',
  OIDC_CLIENT_ID: 'web',
  OIDC_CLIENT_SECRET: 's',
  SESSION_STORE_URL: 'redis://valkey:6379',
  SESSION_SECRET: 'x'.repeat(32),
  SCHEDULE_URL: 'http://schedule:8080',
  RECEIPT_URL: 'http://receipt:8080',
}

describe('loadServerConfig', () => {
  it('必須の値を読み、認可とログアウトの URL の上書きは任意にする', () => {
    expect(loadServerConfig(env).oidc.authorizationEndpoint).toBeUndefined()
    expect(loadServerConfig(env).oidc.endSessionEndpoint).toBeUndefined()
    const oidc = loadServerConfig({
      ...env,
      OIDC_AUTHORIZATION_ENDPOINT: 'http://localhost:9000/a',
      OIDC_END_SESSION_ENDPOINT: 'http://localhost:9000/logout',
    }).oidc
    expect(oidc.authorizationEndpoint).toBe('http://localhost:9000/a')
    expect(oidc.endSessionEndpoint).toBe('http://localhost:9000/logout')
  })

  it('欠けた値の名前を並べ、短い署名の鍵を拒む', () => {
    expect(() => loadServerConfig({ ...env, OIDC_ISSUER: '', SESSION_SECRET: undefined })).toThrow(
      'OIDC_ISSUER, SESSION_SECRET',
    )
    expect(() => loadServerConfig({ ...env, SESSION_SECRET: 'short' })).toThrow('32')
  })
})

describe('signValue', () => {
  it('署名が合うときだけ値を返す', () => {
    const signed = signValue('id-1', 'k'.repeat(32))
    expect(verifySignedValue(signed, 'k'.repeat(32))).toBe('id-1')
    expect(verifySignedValue(signed, 'j'.repeat(32))).toBeUndefined()
    expect(verifySignedValue('id-1', 'k'.repeat(32))).toBeUndefined()
    expect(verifySignedValue(undefined, 'k'.repeat(32))).toBeUndefined()
  })
})

describe('isSameHostOrigin', () => {
  const request = new Request('http://web.internal/auth/logout', { headers: { Host: 'web.test' } })

  it('scheme を問わず Host と同じ host だけを同じとみなす', () => {
    expect(isSameHostOrigin('https://web.test', request)).toBe(true)
    expect(isSameHostOrigin('http://evil.test', request)).toBe(false)
    expect(isSameHostOrigin('null', request)).toBe(false)
  })
})

describe('parseBffCall', () => {
  it('知らない操作と形の違う入力を拒む', () => {
    expect(parseBffCall({ op: 'teams.list', args: ['f'] })).toEqual({
      op: 'teams.list',
      args: ['f'],
    })
    expect(() => parseBffCall({ op: 'schedules.delete', args: [] })).toThrow('schedules.delete')
    expect(() => parseBffCall({ op: 'teams.list' })).toThrow('配列')
    expect(() => parseBffCall(null)).toThrow('形が正しくない')
  })
})

describe('parseBffArgs', () => {
  it('操作ごとの引数の形を確かめる', () => {
    expect(parseBffArgs({ op: 'staff.list', args: ['f'] })).toEqual({ ok: true, args: ['f'] })
    expect(parseBffArgs({ op: 'staff.list', args: ['f', { name: '青木', extra: 1 }] })).toEqual({
      ok: true,
      args: ['f', { name: '青木' }],
    })
    expect(parseBffArgs({ op: 'schedules.list', args: ['f'] })).toMatchObject({ ok: false })
    expect(
      parseBffArgs({
        op: 'schedules.create',
        args: [
          'f',
          { kind: 'other', title: '', staffId: 's', startsAt: 'a', endsAt: 'b', description: '' },
        ],
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('kind') })
  })
})

describe('secureCookie', () => {
  it('デフォルトで Secure を付け、SESSION_COOKIE_SECURE=false のときだけ外す', () => {
    expect(loadServerConfig(env).secureCookie).toBe(true)
    expect(loadServerConfig({ ...env, SESSION_COOKIE_SECURE: 'false' }).secureCookie).toBe(false)
  })
})

describe('createMemorySessionStore の鍵', () => {
  it('自分の値の鍵だけを放す', async () => {
    const store = createMemorySessionStore()
    const token = await store.lock('k', 1000)
    expect(await store.lock('k', 1000)).toBeUndefined()
    await store.unlock('k', 'other')
    expect(await store.exists('k')).toBe(true)
    await store.unlock('k', token as string)
    expect(await store.exists('k')).toBe(false)
  })
})

describe('exceedsBodyLimit', () => {
  const post = (headers: Record<string, string>) =>
    new Request('http://web.test/_serverFn/x', { method: 'POST', headers })

  it('Content-Length が上限を超えるか、長さの分からない本文を拒む', () => {
    expect(exceedsBodyLimit(post({ 'Content-Length': '100' }), 100)).toBe(false)
    expect(exceedsBodyLimit(post({ 'Content-Length': '101' }), 100)).toBe(true)
    expect(exceedsBodyLimit(post({ 'Content-Length': 'x' }), 100)).toBe(true)
    expect(exceedsBodyLimit(post({ 'Transfer-Encoding': 'chunked' }), 100)).toBe(true)
    expect(exceedsBodyLimit(post({}), 100)).toBe(false)
  })
})
