// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { invalidBffArgs, parseBffCall } from '#/api/bff/bffCall'

import { loadServerConfig } from './config'
import { isSameHostOrigin } from './sameOrigin'
import { signValue, verifySignedValue } from './signedValue'

const env = {
  OIDC_ISSUER: 'http://idp.test/buddy',
  OIDC_CLIENT_ID: 'web',
  OIDC_CLIENT_SECRET: 's',
  SESSION_STORE_URL: 'redis://valkey:6379',
  SESSION_SECRET: 'x'.repeat(32),
  SCHEDULE_API_URL: 'http://schedule-api:8080',
  RECEIPT_API_URL: 'http://receipt-api:8080',
}

describe('loadServerConfig', () => {
  it('必須の値を読み、認可の URL の上書きは任意にする', () => {
    expect(loadServerConfig(env).oidc.authorizationEndpoint).toBeUndefined()
    expect(
      loadServerConfig({ ...env, OIDC_AUTHORIZATION_ENDPOINT: 'http://localhost:9000/a' }).oidc
        .authorizationEndpoint,
    ).toBe('http://localhost:9000/a')
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
  it('知らない操作と形の誤りを拒む', () => {
    expect(parseBffCall({ op: 'teams.list', args: ['f'] })).toEqual({
      op: 'teams.list',
      args: ['f'],
    })
    expect(() => parseBffCall({ op: 'schedules.delete', args: [] })).toThrow('schedules.delete')
    expect(() => parseBffCall({ op: 'teams.list' })).toThrow('配列')
    expect(() => parseBffCall(null)).toThrow('形が正しくない')
  })
})

describe('invalidBffArgs', () => {
  it('操作ごとの引数の形を確かめる', () => {
    expect(invalidBffArgs({ op: 'staff.list', args: ['f'] })).toBeUndefined()
    expect(invalidBffArgs({ op: 'staff.list', args: ['f', { name: '青木' }] })).toBeUndefined()
    expect(invalidBffArgs({ op: 'schedules.list', args: ['f'] })).toBeDefined()
    expect(
      invalidBffArgs({
        op: 'schedules.create',
        args: [
          'f',
          { kind: 'other', title: '', staffId: 's', startsAt: 'a', endsAt: 'b', description: '' },
        ],
      }),
    ).toContain('kind')
  })
})

describe('secureCookie', () => {
  it('既定で Secure を付け、SESSION_COOKIE_SECURE=false のときだけ外す', () => {
    expect(loadServerConfig(env).secureCookie).toBe(true)
    expect(loadServerConfig({ ...env, SESSION_COOKIE_SECURE: 'false' }).secureCookie).toBe(false)
  })
})
